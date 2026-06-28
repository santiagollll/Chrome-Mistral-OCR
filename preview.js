'use strict';

const titleEl = document.getElementById('title');
const metaEl = document.getElementById('meta');
const confidenceSummaryEl = document.getElementById('confidenceSummary');
const statusEl = document.getElementById('status');
const rawEditorEl = document.getElementById('rawEditor');
const splitRenderedEl = document.getElementById('splitRendered');
const saveMdBtn = document.getElementById('saveMd');
const copyRawBtn = document.getElementById('copyRaw');
const exportMdBtn = document.getElementById('exportMd');
const exportPdfBtn = document.getElementById('exportPdf');
const exportImagesBtn = document.getElementById('exportImages');
const confidencePopoverEl = document.getElementById('confidencePopover');
const confidencePopoverTextEl = document.getElementById('confidencePopoverText');
const confidenceKeepBtn = document.getElementById('confidenceKeep');
const tr = window.t || ((key) => key);

let currentItem = null;
let draftMarkdown = '';
let renderFrame = null;
let renderTimer = null;
let autoSaveTimer = null;
let autoSaveEnabled = true;
let isSyncingScroll = false;
let scrollAnchors = [];
let anchorBuildFrame = null;
let rawSyncFrame = null;
let activeConfidenceKey = '';
let hidePopoverTimer = null;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || '';
  statusEl.className = isError ? 'small status-line warn' : 'small status-line';
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: err.message });
      resolve(response);
    });
  });
}

function getHashFromUrl() {
  return new URLSearchParams(window.location.search).get('hash') || '';
}

function formatDate(value) {
  if (!value) return tr('no_date');
  return new Date(value).toLocaleString();
}

function imageKey(value) {
  const clean = String(value || '').split('#')[0].split('?')[0];
  const base = clean.split('/').pop() || clean;
  try {
    return decodeURIComponent(base).toLowerCase();
  } catch {
    return base.toLowerCase();
  }
}

function buildImageMap(images) {
  const map = new Map();
  for (const image of images || []) {
    const key = imageKey(image.name);
    if (key && image.dataUrl) map.set(key, image.dataUrl);
  }
  return map;
}

function resolveRenderedImages(root, images) {
  const imageMap = buildImageMap(images);
  for (const img of root.querySelectorAll('img')) {
    const key = imageKey(img.getAttribute('src'));
    const dataUrl = imageMap.get(key);
    if (dataUrl) img.src = dataUrl;
    img.loading = 'lazy';
    if (!img.complete) {
      img.addEventListener('load', scheduleAnchorBuild, { once: true });
      img.addEventListener('error', scheduleAnchorBuild, { once: true });
    }
  }
}

function upgradeLinks(root) {
  for (const link of root.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  }
}

function renderMath(root) {
  if (typeof renderMathInElement !== 'function') return;
  renderMathInElement(root, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false }
    ],
    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
    throwOnError: false
  });
}

function confidencePercent(confidence) {
  return Math.round(Number(confidence || 0) * 100);
}

function confidenceClass(confidence) {
  return confidenceBucket(confidence)?.className || null;
}

function confidenceBucket(confidence) {
  const pct = confidencePercent(confidence);
  if (pct <= 83) return { key: 'red', className: 'confidence-red', label: '<=83%' };
  if (pct >= 84 && pct <= 89) return { key: 'orange', className: 'confidence-orange', label: '84-89%' };
  if (pct >= 90 && pct <= 95) return { key: 'yellow', className: 'confidence-yellow', label: '90-95%' };
  return null;
}

function confidenceKey(score) {
  return [
    score.pageIndex ?? '',
    score.startIndex ?? '',
    score.markdownOffset ?? '',
    String(score.text || '')
  ].join('|');
}

function isConfidenceDismissed(item, score) {
  return !!item.confidenceDecisions?.[confidenceKey(score)];
}

function visibleScoreText(text) {
  const raw = String(text || '')
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '');
  if (raw.trim().startsWith('![')) return '';
  const cleaned = raw
    .trim()
    .replace(/[*_`#>\[\]()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : '';
}

function markdownImageRanges(markdown) {
  const ranges = [];
  const re = /!\[[^\]]*]\([^)]+\)/g;
  let match;
  while ((match = re.exec(markdown || '')) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function isInsideRange(offset, ranges) {
  if (typeof offset !== 'number') return false;
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function hasVisibleConfidenceText(score) {
  const text = String(score.text || '').trim();
  return !!text && !text.startsWith('![');
}

function canReadTextNode(node) {
  const parent = node.parentElement;
  if (!parent) return false;
  return !parent.closest('pre, code, kbd, script, style, textarea, .katex, mark.confidence-low');
}

function collectTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let fullText = '';
  let node;
  while ((node = walker.nextNode())) {
    if (!canReadTextNode(node)) continue;
    nodes.push({
      node,
      start: fullText.length,
      end: fullText.length + node.nodeValue.length
    });
    fullText += node.nodeValue;
  }
  return { nodes, fullText };
}

function findNodeAt(nodes, absoluteOffset) {
  return nodes.find((entry) => absoluteOffset >= entry.start && absoluteOffset <= entry.end) || null;
}

function applyConfidenceDataset(el, score, className) {
  el.classList.add('confidence-low');
  if (className) el.classList.add(className);
  el.dataset.confidenceKey = confidenceKey(score);
  el.dataset.confidence = String(score.confidence);
  el.dataset.confidenceText = String(score.text || '');
  el.title = tr('ocr_confidence_percent', [String(confidencePercent(score.confidence))]);
}

function createConfidenceMark(text, score, className) {
  const mark = document.createElement('mark');
  applyConfidenceDataset(mark, score, className);
  mark.textContent = text;
  return mark;
}

function wrapSingleTextNodeRange(range) {
  const { nodes } = collectTextNodes(range.root);
  const startEntry = findNodeAt(nodes, range.start);
  const endEntry = findNodeAt(nodes, range.end);
  if (!startEntry || !endEntry || startEntry.node !== endEntry.node) return;

  const node = startEntry.node;
  const start = range.start - startEntry.start;
  const end = range.end - startEntry.start;
  const text = node.nodeValue;
  const before = text.slice(0, start);
  const middle = text.slice(start, end);
  const after = text.slice(end);
  if (!middle) return;

  const fragment = document.createDocumentFragment();
  if (before) fragment.appendChild(document.createTextNode(before));
  fragment.appendChild(createConfidenceMark(middle, range.score, range.className));
  if (after) fragment.appendChild(document.createTextNode(after));
  node.parentNode.replaceChild(fragment, node);
}

function findHighlightIndex(fullText, text, ranges, preferredStart) {
  const starts = [preferredStart, Math.max(0, preferredStart - 80), 0];
  for (const startFrom of starts) {
    let index = fullText.indexOf(text, Math.max(0, startFrom || 0));
    while (index >= 0) {
      const end = index + text.length;
      const overlaps = ranges.some((range) => index < range.end && end > range.start);
      if (!overlaps) return index;
      index = fullText.indexOf(text, index + 1);
    }
  }
  return -1;
}

function visiblePrefixForMarkdown(markdown) {
  const markedApi = window.marked?.marked || window.marked;
  const parsed = markedApi.parse(markdown || '', {
    gfm: true,
    breaks: false,
    silent: true
  });
  const template = document.createElement('template');
  template.innerHTML = DOMPurify.sanitize(parsed);
  const scratch = document.createElement('div');
  scratch.appendChild(template.content.cloneNode(true));
  for (const node of scratch.querySelectorAll('pre, code, kbd, script, style, textarea')) {
    node.remove();
  }
  return scratch.textContent || '';
}

function approximateVisibleOffset(markdown, markdownOffset) {
  if (typeof markdownOffset !== 'number' || markdownOffset <= 0) return 0;
  return visiblePrefixForMarkdown(markdown.slice(0, markdownOffset)).length;
}

function applyConfidenceHighlights(root, item) {
  const confidenceWords = item.resolvedConfidenceScores || item.confidenceWords || [];
  const imageRanges = markdownImageRanges(item.markdown || '');
  const { fullText } = collectTextNodes(root);
  const ranges = [];
  let preferredStart = 0;
  const visibleOffsetCache = new Map();

  for (const score of confidenceWords) {
    const className = confidenceClass(score.confidence);
    if (!className || isConfidenceDismissed(item, score)) continue;
    if (isInsideRange(score.markdownOffset, imageRanges)) continue;

    const text = visibleScoreText(score.text);
    const expectedOffset = visibleOffsetCache.has(score.markdownOffset)
      ? visibleOffsetCache.get(score.markdownOffset)
      : approximateVisibleOffset(item.markdown || '', score.markdownOffset);
    visibleOffsetCache.set(score.markdownOffset, expectedOffset);
    const preferred = typeof score.markdownOffset === 'number' ? expectedOffset : preferredStart;
    if (!text) continue;

    const index = findHighlightIndex(fullText, text, ranges, preferred);
    if (index < 0) continue;

    const start = index;
    const end = index + text.length;
    ranges.push({ root, start, end, className, score });
    preferredStart = end;
  }

  ranges.sort((a, b) => b.start - a.start).forEach(wrapSingleTextNodeRange);
}

function rawScoreCandidates(score) {
  const candidates = [];
  const original = String(score.text || '');
  const visible = visibleScoreText(original);
  for (const text of [original, visible]) {
    if (!text || text.trim().startsWith('![')) continue;
    if (!candidates.includes(text)) candidates.push(text);
  }
  return candidates;
}

function rangeOverlapsUsed(start, end, usedRanges) {
  return usedRanges.some((range) => start < range.end && end > range.start);
}

function firstAvailableMatch(markdown, text, usedRanges, startFrom = 0) {
  let found = markdown.indexOf(text, Math.max(0, startFrom));
  while (found >= 0) {
    const end = found + text.length;
    if (!rangeOverlapsUsed(found, end, usedRanges)) return found;
    found = markdown.indexOf(text, found + 1);
  }
  return -1;
}

function findRawScoreMatch(markdown, score, usedRanges) {
  const expected = typeof score.markdownOffset === 'number' ? score.markdownOffset : -1;
  const candidates = rawScoreCandidates(score);
  if (!candidates.length) return null;

  for (const text of candidates) {
    if (expected >= 0 && markdown.slice(expected, expected + text.length) === text) {
      const end = expected + text.length;
      if (!rangeOverlapsUsed(expected, end, usedRanges)) return { start: expected, text };
    }
  }

  const starts = expected >= 0 ? [Math.max(0, expected - 80), 0] : [0];
  for (const text of candidates) {
    for (const startFrom of starts) {
      const start = firstAvailableMatch(markdown, text, usedRanges, startFrom);
      if (start >= 0) return { start, text };
    }
  }

  return null;
}

function buildRawHighlightRanges(markdown, item) {
  const ranges = [];
  const imageRanges = markdownImageRanges(markdown);

  for (const score of item.confidenceWords || []) {
    const className = confidenceClass(score.confidence);
    if (!className || isConfidenceDismissed(item, score)) continue;
    if (isInsideRange(score.markdownOffset, imageRanges)) continue;

    const match = findRawScoreMatch(markdown, score, ranges);
    if (!match) continue;

    const end = match.start + match.text.length;
    if (rangeOverlapsUsed(match.start, end, ranges)) continue;
    ranges.push({
      start: match.start,
      end,
      score: {
        ...score,
        resolvedRawStart: match.start,
        resolvedRawEnd: end,
        resolvedRawText: match.text
      },
      className
    });
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function renderRawEditor(markdown, item) {
  const ranges = item.rawConfidenceRanges || buildRawHighlightRanges(markdown, item);
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      fragment.appendChild(document.createTextNode(markdown.slice(cursor, range.start)));
    }
    fragment.appendChild(createConfidenceMark(markdown.slice(range.start, range.end), range.score, range.className));
    cursor = range.end;
  }
  if (cursor < markdown.length) {
    fragment.appendChild(document.createTextNode(markdown.slice(cursor)));
  }
  if (!markdown) fragment.appendChild(document.createElement('br'));

  rawEditorEl.replaceChildren(fragment);
}

function markdownBlockOffsets(markdown) {
  const markedApi = window.marked?.marked || window.marked;
  if (!markedApi?.lexer) return [];

  const source = String(markdown || '');
  const tokens = markedApi.lexer(source, {
    gfm: true,
    breaks: false,
    silent: true
  });
  const links = tokens.links || {};
  const ranges = [];
  let cursor = 0;

  for (const token of tokens) {
    const raw = String(token.raw || '');
    if (!raw) continue;

    const found = source.indexOf(raw, cursor);
    const start = found >= 0 ? found : cursor;
    const end = Math.min(source.length, start + raw.length);
    cursor = end;

    if (token.type === 'space') continue;
    ranges.push({ start, end, raw, token, links });
  }

  return ranges;
}

function firstVisibleMarkdownOffset(markdown, start, end) {
  const slice = String(markdown || '').slice(start, end);
  const match = /\S/.exec(slice);
  return start + (match ? match.index : 0);
}

function renderAnchoredMarkdown(markdown) {
  const markedApi = window.marked?.marked || window.marked;
  const ranges = markdownBlockOffsets(markdown);
  if (!ranges.length) {
    return markedApi.parse(markdown || '', {
      gfm: true,
      breaks: false,
      silent: true
    });
  }

  return ranges.map((range) => {
    const tokenList = [range.token];
    tokenList.links = range.links || {};
    const parsed = typeof markedApi.parser === 'function'
      ? markedApi.parser(tokenList, {
        gfm: true,
        breaks: false,
        silent: true
      })
      : markedApi.parse(range.raw, {
        gfm: true,
        breaks: false,
        silent: true
      });
    return `<div class="markdown-sync-block" data-md-start="${range.start}" data-md-end="${range.end}">${parsed}</div>`;
  }).join('');
}

function renderMarkdownInto(root, item) {
  const markdown = item.markdown || '';
  const rawRanges = item.rawConfidenceRanges || buildRawHighlightRanges(markdown, item);
  const parsed = renderAnchoredMarkdown(markdown);
  const clean = DOMPurify.sanitize(parsed, {
    ADD_ATTR: ['target', 'rel', 'data-md-start', 'data-md-end']
  });

  root.innerHTML = clean;
  resolveRenderedImages(root, item.images || []);
  upgradeLinks(root);
  renderMath(root);
  applyConfidenceHighlights(root, {
    ...item,
    resolvedConfidenceScores: rawRanges.map((range) => range.score)
  });
  scheduleAnchorBuild();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printableStyles() {
  return `
    :root {
      --border: #d9dee4;
      --text: #18212a;
      --muted: #66717d;
      --code-bg: #f0f3f6;
      --confidence-yellow: #fff3a3;
      --confidence-orange: #ffd0a1;
      --confidence-red: #ffc9c9;
    }
    @page { margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      color: var(--text);
      font-family: Georgia, "Times New Roman", serif;
      margin: 0;
    }
    .print-header {
      border-bottom: 1px solid var(--border);
      margin-bottom: 18px;
      padding-bottom: 10px;
    }
    .print-header h1 {
      font-size: 22px;
      line-height: 1.25;
      margin: 0 0 6px;
      overflow-wrap: anywhere;
    }
    .print-meta {
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      font: 11px Verdana, sans-serif;
      gap: 6px 12px;
    }
    .markdown-body {
      font-size: 12pt;
      line-height: 1.55;
    }
    .markdown-sync-block {
      display: flow-root;
    }
    .markdown-body h1,
    .markdown-body h2,
    .markdown-body h3,
    .markdown-body h4,
    .markdown-body h5,
    .markdown-body h6 {
      break-after: avoid;
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.2;
      margin: 1.35em 0 0.55em;
    }
    .markdown-body h1 { font-size: 1.9em; }
    .markdown-body h2 { border-bottom: 1px solid var(--border); font-size: 1.5em; padding-bottom: 0.2em; }
    .markdown-body h3 { font-size: 1.25em; }
    .markdown-body p, .markdown-body ul, .markdown-body ol, .markdown-body blockquote, .markdown-body table {
      margin: 0 0 0.9em;
    }
    .markdown-body blockquote {
      border-left: 4px solid var(--border);
      color: #4e5b67;
      padding-left: 12px;
    }
    .markdown-body pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      overflow-wrap: anywhere;
      padding: 10px;
      white-space: pre-wrap;
    }
    .markdown-body code {
      background: var(--code-bg);
      border-radius: 3px;
      font: 0.9em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding: 0.1em 0.24em;
    }
    .markdown-body pre code {
      background: transparent;
      padding: 0;
    }
    .markdown-body table {
      border-collapse: collapse;
      display: table;
      width: 100%;
    }
    .markdown-body th,
    .markdown-body td {
      border: 1px solid var(--border);
      padding: 6px 8px;
      vertical-align: top;
    }
    .markdown-body th {
      background: #f2f5f7;
      font-weight: 700;
    }
    .markdown-body img {
      display: block;
      height: auto;
      margin: 12px auto;
      max-width: 100%;
      page-break-inside: avoid;
    }
    .markdown-body hr {
      border: 0;
      border-top: 1px solid var(--border);
      margin: 1.6em 0;
    }
    .confidence-low {
      border-radius: 3px;
      color: inherit;
      padding: 0.02em 0.12em;
    }
    .confidence-yellow { background: var(--confidence-yellow); }
    .confidence-orange { background: var(--confidence-orange); }
    .confidence-red { background: var(--confidence-red); }
    a { color: inherit; text-decoration: none; }
  `;
}

function buildPrintableRenderedHtml() {
  const rawConfidenceRanges = buildRawHighlightRanges(draftMarkdown, currentItem);
  const scratch = document.createElement('div');
  scratch.className = 'markdown-body';
  renderMarkdownInto(scratch, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges });
  for (const img of scratch.querySelectorAll('img')) img.removeAttribute('loading');
  return scratch.innerHTML;
}

function printableMetaHtml(item) {
  const parts = [
    `SHA: ${item.hash}`,
    tr('type_value', [item.resourceKind || tr('unknown')]),
    tr('pages_count', [String(item.pages ?? 0)]),
    tr('images_count', [String(item.imagesCount ?? 0)]),
    tr('updated_at', [formatDate(item.updatedAt || item.createdAt)])
  ];
  return parts.map((part) => `<span>${escapeHtml(part)}</span>`).join('');
}

function safePdfFileName(name) {
  const safeName = String(name || 'preview')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ') || 'preview';
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
}

function buildPdfExportHtml() {
  const title = currentItem?.name || 'Preview';
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${chrome.runtime.getURL('vendor/katex/katex.min.css')}">
    <style>${printableStyles()}</style>
  </head>
  <body>
    <header class="print-header">
      <h1>${escapeHtml(title)}</h1>
      <div class="print-meta">${printableMetaHtml(currentItem || {})}</div>
    </header>
    <main class="markdown-body">${buildPrintableRenderedHtml()}</main>
  </body>
</html>`;
}

function confidenceCounts(item) {
  const counts = {
    yellow: { label: '90-95%', className: 'confidence-yellow', count: 0 },
    orange: { label: '84-89%', className: 'confidence-orange', count: 0 },
    red: { label: '<=83%', className: 'confidence-red', count: 0 }
  };
  const imageRanges = markdownImageRanges(item.markdown || '');

  for (const score of item.confidenceWords || []) {
    const bucket = confidenceBucket(score.confidence);
    if (!bucket || isConfidenceDismissed(item, score)) continue;
    if (!hasVisibleConfidenceText(score)) continue;
    if (isInsideRange(score.markdownOffset, imageRanges)) continue;
    counts[bucket.key].count += 1;
  }

  return counts;
}

function lowConfidenceKeys(item) {
  const keys = [];
  const imageRanges = markdownImageRanges(item.markdown || '');

  for (const score of item.confidenceWords || []) {
    const bucket = confidenceBucket(score.confidence);
    if (!bucket || isConfidenceDismissed(item, score)) continue;
    if (!hasVisibleConfidenceText(score)) continue;
    if (isInsideRange(score.markdownOffset, imageRanges)) continue;
    keys.push(confidenceKey(score));
  }

  return Array.from(new Set(keys));
}

function renderConfidenceSummary(item) {
  confidenceSummaryEl.innerHTML = '';
  const counts = confidenceCounts(item);
  const activeBuckets = ['yellow', 'orange', 'red'].filter((key) => counts[key].count > 0);
  if (!activeBuckets.length) return;

  const label = document.createElement('span');
  label.className = 'confidence-summary-label';
  label.textContent = tr('low_confidence_word_count');
  confidenceSummaryEl.appendChild(label);

  for (const key of activeBuckets) {
    const bucket = counts[key];
    const pill = document.createElement('span');
    pill.className = `confidence-pill ${bucket.className}`;
    pill.textContent = `${bucket.label}: ${bucket.count}`;
    confidenceSummaryEl.appendChild(pill);
  }

  const preserveAllBtn = document.createElement('button');
  preserveAllBtn.type = 'button';
  preserveAllBtn.className = 'confidence-summary-action';
  preserveAllBtn.textContent = tr('keep_all_words');
  preserveAllBtn.addEventListener('click', preserveAllConfidenceWords);
  confidenceSummaryEl.appendChild(preserveAllBtn);
}

function renderHeader(item) {
  titleEl.textContent = item.name || 'Preview/Edit';
  document.title = `${item.name || 'Preview/Edit'} - Mistral OCR`;
  metaEl.innerHTML = '';

  const parts = [
    `SHA: ${item.hash}`,
    tr('type_value', [item.resourceKind || tr('unknown')]),
    tr('pages_count', [String(item.pages ?? 0)]),
    tr('images_count', [String(item.imagesCount ?? 0)]),
    tr('updated_at', [formatDate(item.updatedAt || item.createdAt)])
  ];

  for (const part of parts) {
    const span = document.createElement('span');
    span.textContent = part;
    metaEl.appendChild(span);
  }
}

function renderPreview(item) {
  currentItem = {
    ...item,
    confidenceDecisions: item.confidenceDecisions || {}
  };
  draftMarkdown = item.markdown || '';
  const rawConfidenceRanges = buildRawHighlightRanges(draftMarkdown, currentItem);
  renderHeader(currentItem);
  renderConfidenceSummary(currentItem);
  renderRawEditor(draftMarkdown, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges });
  renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges });
  setStatus('');
}

function configureAutoSave(disabled) {
  autoSaveEnabled = disabled !== true;
  saveMdBtn.hidden = autoSaveEnabled;
}

function textNodeAtOffset(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node;
  let lastNode = null;

  while ((node = walker.nextNode())) {
    lastNode = node;
    const length = node.nodeValue.length;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }

  return lastNode ? { node: lastNode, offset: lastNode.nodeValue.length } : null;
}

function textOffsetTop(root, offset) {
  const position = textNodeAtOffset(root, offset);
  if (!position) return 0;

  const range = document.createRange();
  const start = Math.min(position.offset, position.node.nodeValue.length);
  const end = Math.min(position.node.nodeValue.length, start + 1);
  range.setStart(position.node, start);
  range.setEnd(position.node, end);

  let rect = range.getBoundingClientRect();
  if (!rect.height && start > 0) {
    range.setStart(position.node, start - 1);
    range.setEnd(position.node, start);
    rect = range.getBoundingClientRect();
  }

  const rootRect = root.getBoundingClientRect();
  return Math.max(0, rect.top - rootRect.top + root.scrollTop);
}

function renderedSyncBlocks(root) {
  return Array.from(root.querySelectorAll('.markdown-sync-block[data-md-start][data-md-end]'));
}

function elementTop(root, el) {
  const rootRect = root.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return Math.max(0, rect.top - rootRect.top + root.scrollTop);
}

function buildScrollAnchors() {
  const blocks = renderedSyncBlocks(splitRenderedEl);
  const anchors = [];

  for (const block of blocks) {
    const mdStart = Number(block.dataset.mdStart);
    const mdEnd = Number(block.dataset.mdEnd);
    if (!Number.isFinite(mdStart) || !Number.isFinite(mdEnd)) continue;

    anchors.push({
      rawTop: textOffsetTop(rawEditorEl, firstVisibleMarkdownOffset(draftMarkdown, mdStart, mdEnd)),
      renderedTop: elementTop(splitRenderedEl, block)
    });
  }

  const rawMax = Math.max(0, rawEditorEl.scrollHeight - rawEditorEl.clientHeight);
  const renderedMax = Math.max(0, splitRenderedEl.scrollHeight - splitRenderedEl.clientHeight);
  anchors.unshift({ rawTop: 0, renderedTop: 0 });
  anchors.push({ rawTop: rawMax, renderedTop: renderedMax });

  scrollAnchors = anchors
    .sort((a, b) => a.renderedTop - b.renderedTop)
    .filter((anchor, index, list) => index === 0 || anchor.rawTop !== list[index - 1].rawTop || anchor.renderedTop !== list[index - 1].renderedTop);
}

function scheduleAnchorBuild() {
  if (anchorBuildFrame) cancelAnimationFrame(anchorBuildFrame);
  anchorBuildFrame = requestAnimationFrame(() => {
    anchorBuildFrame = null;
    buildScrollAnchors();
  });
}

function textOffsetFromSelection(root) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.endContainer)) return null;
  const probe = range.cloneRange();
  probe.selectNodeContents(root);
  probe.setEnd(range.endContainer, range.endOffset);
  return probe.toString().length;
}

function restoreSelectionFromTextOffset(root, offset) {
  if (typeof offset !== 'number') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node;
  while ((node = walker.nextNode())) {
    const length = node.nodeValue.length;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, Math.max(0, remaining));
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function editorTextFromNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
  if (node.nodeName === 'BR') return '\n';

  let text = '';
  for (const child of node.childNodes) {
    text += editorTextFromNode(child);
  }

  if (node !== rawEditorEl && (node.nodeName === 'DIV' || node.nodeName === 'P') && !text.endsWith('\n')) {
    text += '\n';
  }
  return text;
}

function readDraftFromEditor() {
  draftMarkdown = editorTextFromNode(rawEditorEl).replace(/\n$/, '');
}

function scheduleRenderedRefresh() {
  if (renderFrame) cancelAnimationFrame(renderFrame);
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderFrame = requestAnimationFrame(() => {
      renderTimer = null;
      renderFrame = null;
      if (!currentItem) return;
      const rawConfidenceRanges = buildRawHighlightRanges(draftMarkdown, currentItem);
      renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges });
      scheduleRawScrollSync();
    });
  }, 650);
}

function syncRawToRenderedScroll() {
  if (isSyncingScroll) return;
  isSyncingScroll = true;
  const target = renderedScrollToRaw(splitRenderedEl.scrollTop);
  rawEditorEl.scrollTop = target;
  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });
}

function scheduleRawScrollSync() {
  if (rawSyncFrame) cancelAnimationFrame(rawSyncFrame);
  rawSyncFrame = requestAnimationFrame(() => {
    rawSyncFrame = null;
    syncRawToRenderedScroll();
  });
}

function interpolateBetweenAnchors(position) {
  if (scrollAnchors.length < 2) return null;

  const anchors = scrollAnchors;
  let previous = anchors[0];
  let next = anchors[anchors.length - 1];

  for (let i = 0; i < anchors.length - 1; i++) {
    if (position >= anchors[i].renderedTop && position <= anchors[i + 1].renderedTop) {
      previous = anchors[i];
      next = anchors[i + 1];
      break;
    }
  }

  const span = next.renderedTop - previous.renderedTop;
  const progress = span > 0 ? (position - previous.renderedTop) / span : 0;
  return previous.rawTop + (next.rawTop - previous.rawTop) * Math.min(1, Math.max(0, progress));
}

function renderedScrollToRaw(renderedTop) {
  const target = interpolateBetweenAnchors(renderedTop);
  if (typeof target === 'number' && Number.isFinite(target)) {
    return target;
  }

  const renderedMax = splitRenderedEl.scrollHeight - splitRenderedEl.clientHeight;
  const rawMax = rawEditorEl.scrollHeight - rawEditorEl.clientHeight;
  const ratio = renderedMax > 0 ? renderedTop / renderedMax : 0;
  return rawMax > 0 ? ratio * rawMax : 0;
}

function wheelDeltaPixels(event) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return { x: event.deltaX * 16, y: event.deltaY * 16 };
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return { x: event.deltaX * splitRenderedEl.clientWidth, y: event.deltaY * splitRenderedEl.clientHeight };
  }
  return { x: event.deltaX, y: event.deltaY };
}

function removeConfidenceMarks(key) {
  for (const mark of document.querySelectorAll('mark.confidence-low')) {
    if (mark.dataset.confidenceKey !== key) continue;
    mark.replaceWith(document.createTextNode(mark.textContent || ''));
  }
}

function showConfidencePopover(mark) {
  clearTimeout(hidePopoverTimer);
  activeConfidenceKey = mark.dataset.confidenceKey || '';
  const pct = confidencePercent(mark.dataset.confidence);
  confidencePopoverTextEl.textContent = tr('ocr_confidence_percent', [String(pct)]);
  confidencePopoverEl.classList.add('visible');
  confidencePopoverEl.dataset.confidenceKey = activeConfidenceKey;

  const rect = mark.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 82, rect.bottom + 8);
  const left = Math.min(window.innerWidth - 270, Math.max(8, rect.left));
  confidencePopoverEl.style.top = `${Math.max(8, top)}px`;
  confidencePopoverEl.style.left = `${left}px`;
}

function scheduleHideConfidencePopover() {
  clearTimeout(hidePopoverTimer);
  hidePopoverTimer = setTimeout(() => {
    confidencePopoverEl.classList.remove('visible');
    activeConfidenceKey = '';
  }, 180);
}

function confidenceMarkFromSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const node = selection.anchorNode;
  if (!node || !rawEditorEl.contains(node)) return null;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return el?.closest?.('mark.confidence-low') || null;
}

async function persistConfidenceDecision(key, { silent = false } = {}) {
  if (!currentItem || !key) return;
  const previousDecisions = currentItem.confidenceDecisions || {};
  currentItem.confidenceDecisions = {
    ...previousDecisions,
    [key]: 'keep'
  };
  removeConfidenceMarks(key);
  renderConfidenceSummary({ ...currentItem, markdown: draftMarkdown });
  scheduleHideConfidencePopover();
  if (!silent) setStatus(tr('word_kept'));

  const resp = await sendMessage({
    type: 'SET_CONFIDENCE_DECISION',
    hash: currentItem.hash,
    key,
    decision: 'keep'
  });
  if (!resp?.ok || !resp.item) {
    currentItem.confidenceDecisions = previousDecisions;
    const rawConfidenceRanges = buildRawHighlightRanges(draftMarkdown, currentItem);
    renderRawEditor(draftMarkdown, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges });
    renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges });
    if (!silent) setStatus(resp?.error || tr('could_not_update_word'), true);
    return;
  }

  currentItem.confidenceDecisions = resp.item.confidenceDecisions || {
    ...(currentItem.confidenceDecisions || {}),
    [key]: 'keep'
  };
  renderConfidenceSummary({ ...currentItem, markdown: draftMarkdown });
}

async function preserveAllConfidenceWords() {
  if (!currentItem) return;
  const keys = lowConfidenceKeys({ ...currentItem, markdown: draftMarkdown });
  if (!keys.length) {
    setStatus(tr('no_pending_words'));
    return;
  }

  const previousDecisions = currentItem.confidenceDecisions || {};
  const nextDecisions = { ...previousDecisions };
  for (const key of keys) nextDecisions[key] = 'keep';
  currentItem.confidenceDecisions = nextDecisions;
  scheduleHideConfidencePopover();

  const rawConfidenceRanges = buildRawHighlightRanges(draftMarkdown, currentItem);
  renderRawEditor(draftMarkdown, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges });
  renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges });
  renderConfidenceSummary({ ...currentItem, markdown: draftMarkdown });
  setStatus(tr('all_marked_words_kept'));

  const resp = await sendMessage({
    type: 'SET_CONFIDENCE_DECISIONS',
    hash: currentItem.hash,
    keys
  });
  if (!resp?.ok || !resp.item) {
    currentItem.confidenceDecisions = previousDecisions;
    const rollbackRanges = buildRawHighlightRanges(draftMarkdown, currentItem);
    renderRawEditor(draftMarkdown, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges: rollbackRanges });
    renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown, rawConfidenceRanges: rollbackRanges });
    renderConfidenceSummary({ ...currentItem, markdown: draftMarkdown });
    setStatus(resp?.error || tr('could_not_keep_all_words'), true);
    return;
  }

  currentItem.confidenceDecisions = resp.item.confidenceDecisions || nextDecisions;
  renderConfidenceSummary({ ...currentItem, markdown: draftMarkdown });
}

function persistEditedConfidenceMarks(caretOffset) {
  if (!currentItem) return;
  const mark = confidenceMarkFromSelection();
  if (!mark) return;

  const key = mark.dataset.confidenceKey || '';
  if (!key || (mark.textContent || '') === (mark.dataset.confidenceText || '')) return;

  currentItem.confidenceDecisions = {
    ...(currentItem.confidenceDecisions || {}),
    [key]: 'keep'
  };
  removeConfidenceMarks(key);
  renderConfidenceSummary({ ...currentItem, markdown: draftMarkdown });
  restoreSelectionFromTextOffset(rawEditorEl, caretOffset);
  void persistConfidenceDecision(key, { silent: true });
}

async function copyRaw() {
  if (!currentItem) return;
  readDraftFromEditor();
  try {
    await navigator.clipboard.writeText(draftMarkdown || '');
    setStatus(tr('markdown_copied'));
  } catch {
    const ta = document.createElement('textarea');
    ta.value = draftMarkdown || '';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setStatus(tr('markdown_copied'));
  }
}

async function exportMarkdown() {
  if (!currentItem) return;
  const resp = await sendMessage({ type: 'EXPORT_MARKDOWN', hash: currentItem.hash });
  setStatus(resp?.ok ? tr('markdown_exported') : (resp?.error || tr('could_not_export_markdown')), !resp?.ok);
}

async function exportImages() {
  if (!currentItem) return;
  const resp = await sendMessage({ type: 'EXPORT_IMAGES', hash: currentItem.hash });
  setStatus(resp?.ok ? tr('images_exported') : (resp?.error || tr('could_not_export_images')), !resp?.ok);
}

async function exportRenderedPdf() {
  if (!currentItem) return;
  readDraftFromEditor();
  setStatus(tr('preparing_pdf'));

  const blobUrl = URL.createObjectURL(new Blob([buildPdfExportHtml()], { type: 'text/html' }));
  try {
    const resp = await sendMessage({
      type: 'EXPORT_RENDERED_PDF',
      blobUrl,
      filename: safePdfFileName(currentItem.name)
    });
    setStatus(resp?.ok ? tr('pdf_exported') : (resp?.error || tr('could_not_export_pdf')), !resp?.ok);
  } catch (error) {
    setStatus(error?.message || tr('could_not_export_pdf'), true);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function saveMarkdown() {
  if (!currentItem) return;
  readDraftFromEditor();
  setStatus(tr('saving_changes'));
  const resp = await sendMessage({
    type: 'SAVE_MARKDOWN',
    hash: currentItem.hash,
    markdown: draftMarkdown
  });
  if (!resp?.ok || !resp.item) {
    setStatus(resp?.error || tr('could_not_save_changes'), true);
    return;
  }

  renderPreview(resp.item);
  setStatus(tr('changes_saved'));
}

function scheduleAutoSave() {
  if (!autoSaveEnabled || !currentItem) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    readDraftFromEditor();
    const resp = await sendMessage({
      type: 'SAVE_MARKDOWN',
      hash: currentItem.hash,
      markdown: draftMarkdown
    });
    if (!resp?.ok || !resp.item) {
      setStatus(resp?.error || tr('could_not_auto_save_changes'), true);
      return;
    }
    currentItem = {
      ...currentItem,
      ...resp.item,
      markdown: draftMarkdown,
      confidenceDecisions: resp.item.confidenceDecisions || currentItem.confidenceDecisions || {}
    };
    setStatus(tr('changes_auto_saved'));
  }, 900);
}

async function load() {
  const hash = getHashFromUrl();
  if (!hash) {
    setStatus(tr('missing_transcription_hash'), true);
    return;
  }

  setStatus(tr('loading_preview'));
  const resp = await sendMessage({ type: 'GET_PREVIEW_DATA', hash });
  if (!resp?.ok || !resp.item) {
    setStatus(resp?.error || tr('could_not_load_preview'), true);
    return;
  }

  configureAutoSave(resp.previewAutoSaveDisabled === true);
  renderPreview(resp.item);
}

rawEditorEl.addEventListener('input', () => {
  const caretOffset = textOffsetFromSelection(rawEditorEl);
  readDraftFromEditor();
  persistEditedConfidenceMarks(caretOffset);
  scheduleRenderedRefresh();
  scheduleAutoSave();
});

rawEditorEl.addEventListener('wheel', (event) => {
  event.preventDefault();
  const delta = wheelDeltaPixels(event);
  splitRenderedEl.scrollTop += delta.y;
  splitRenderedEl.scrollLeft += delta.x;
  syncRawToRenderedScroll();
}, { passive: false });

rawEditorEl.addEventListener('scroll', () => {
  if (!isSyncingScroll) scheduleRawScrollSync();
});

splitRenderedEl.addEventListener('scroll', syncRawToRenderedScroll);

document.addEventListener('mouseover', (event) => {
  const mark = event.target.closest?.('.confidence-low');
  if (mark) showConfidencePopover(mark);
});

document.addEventListener('mouseout', (event) => {
  if (event.target.closest?.('.confidence-low')) scheduleHideConfidencePopover();
});

confidencePopoverEl.addEventListener('mouseover', () => clearTimeout(hidePopoverTimer));
confidencePopoverEl.addEventListener('mouseout', scheduleHideConfidencePopover);
confidenceKeepBtn.addEventListener('click', () => persistConfidenceDecision(activeConfidenceKey));
saveMdBtn.addEventListener('click', saveMarkdown);
copyRawBtn.addEventListener('click', copyRaw);
exportMdBtn.addEventListener('click', exportMarkdown);
exportPdfBtn.addEventListener('click', exportRenderedPdf);
exportImagesBtn.addEventListener('click', exportImages);

load();
