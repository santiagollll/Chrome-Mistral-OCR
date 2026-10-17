'use strict';

const titleEl = document.getElementById('title');
const resourceIdentityEl = document.getElementById('resourceIdentity');
const metaEl = document.getElementById('meta');
const confidenceSummaryEl = document.getElementById('confidenceSummary');
const statusEl = document.getElementById('status');
const statusMessageEl = document.getElementById('statusMessage');
const statusDismissBtn = document.getElementById('statusDismiss');
const rawEditorEl = document.getElementById('rawEditor');
const splitRenderedEl = document.getElementById('splitRendered');
const splitModeEl = document.getElementById('splitMode');
const renameTitleBtn = document.getElementById('renameTitle');
const saveMdBtn = document.getElementById('saveMd');
const copyRawBtn = document.getElementById('copyRaw');
const exportMdBtn = document.getElementById('exportMd');
const exportPdfBtn = document.getElementById('exportPdf');
const exportImagesBtn = document.getElementById('exportImages');
const exportMenuEl = document.getElementById('exportMenu');
const detailsToggleBtn = document.getElementById('detailsToggle');
const previewDetailsEl = document.getElementById('previewDetails');
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
let disableClassicLatexRendering = false;
let scrollSyncOrigin = '';
let scrollAnchors = [];
let anchorBuildFrame = null;
let scrollSyncFrame = null;
let touchScrollSource = null;
let touchScrollPointerId = null;
let touchScrollReleaseTimer = null;
let activeConfidenceKey = '';
let hidePopoverTimer = null;
let statusTimer = null;
let viewerResizeObserver = null;

function setStatus(msg, options = {}) {
  clearTimeout(statusTimer);
  statusTimer = null;

  if (!msg) {
    statusMessageEl.textContent = '';
    statusEl.hidden = true;
    statusEl.removeAttribute('data-tone');
    statusDismissBtn.hidden = true;
    return;
  }

  const normalized = typeof options === 'boolean'
    ? { tone: options ? 'error' : 'success' }
    : options;
  const tone = normalized.tone || 'success';
  const defaultDuration = tone === 'error' || tone === 'progress' ? 0 : 3000;
  const duration = Number.isFinite(normalized.duration) ? normalized.duration : defaultDuration;

  statusMessageEl.textContent = msg;
  statusEl.dataset.tone = tone;
  statusEl.hidden = false;
  statusDismissBtn.hidden = tone !== 'error';

  if (duration > 0) {
    statusTimer = setTimeout(() => setStatus(''), duration);
  }
}

function setPreviewDetailsExpanded(expanded, { persist = false } = {}) {
  previewDetailsEl.hidden = !expanded;
  detailsToggleBtn.setAttribute('aria-expanded', String(expanded));
  const label = tr(expanded ? 'hide_preview_details' : 'show_preview_details');
  detailsToggleBtn.setAttribute('aria-label', label);
  detailsToggleBtn.title = label;
  scheduleAnchorBuild();

  if (persist) {
    void chrome.storage.local.set({ previewDetailsExpanded: expanded });
  }
}

async function loadPreviewDetailsPreference() {
  try {
    const { previewDetailsExpanded = false } = await chrome.storage.local.get(['previewDetailsExpanded']);
    setPreviewDetailsExpanded(previewDetailsExpanded === true);
  } catch {
    setPreviewDetailsExpanded(false);
  }
}

function closeExportMenu({ restoreFocus = false } = {}) {
  if (!exportMenuEl.open) return;
  exportMenuEl.open = false;
  if (restoreFocus) exportMenuEl.querySelector('summary')?.focus();
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: window.getUserFacingError?.(err.message) || err.message });
      if (response?.error) return resolve({ ...response, error: window.getUserFacingError?.(response.error) || response.error });
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

function validateTranscriptionName(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return tr('error_transcription_name_required');
  if (Array.from(normalized).length > 200) return tr('error_transcription_name_too_long');
  return '';
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

const MODERN_LATEX_DELIMITERS = [
  { left: '\\begin{equation*}', right: '\\end{equation*}', display: true },
  { left: '\\begin{alignat*}', right: '\\end{alignat*}', display: true },
  { left: '\\begin{align*}', right: '\\end{align*}', display: true },
  { left: '\\begin{gather*}', right: '\\end{gather*}', display: true },
  { left: '\\begin{equation}', right: '\\end{equation}', display: true },
  { left: '\\begin{alignat}', right: '\\end{alignat}', display: true },
  { left: '\\begin{align}', right: '\\end{align}', display: true },
  { left: '\\begin{gather}', right: '\\end{gather}', display: true },
  { left: '\\begin{CD}', right: '\\end{CD}', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false }
];

const CLASSIC_LATEX_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '$', right: '$', display: false }
];

const MODERN_LATEX_MARKED_EXTENSION = {
  name: 'modernLatex',
  level: 'inline',
  start(source) {
    let firstIndex = -1;
    for (const delimiter of MODERN_LATEX_DELIMITERS) {
      const index = source.indexOf(delimiter.left);
      if (index >= 0 && (firstIndex < 0 || index < firstIndex)) {
        firstIndex = index;
      }
    }
    return firstIndex >= 0 ? firstIndex : undefined;
  },
  tokenizer(source) {
    for (const delimiter of MODERN_LATEX_DELIMITERS) {
      if (!source.startsWith(delimiter.left)) continue;

      const closingIndex = source.indexOf(delimiter.right, delimiter.left.length);
      if (closingIndex < 0) return undefined;

      const raw = source.slice(0, closingIndex + delimiter.right.length);
      return {
        type: 'modernLatex',
        raw,
        text: raw
      };
    }
    return undefined;
  },
  renderer(token) {
    return escapeHtml(token.raw);
  }
};

let modernLatexMarkedExtensionInstalled = false;

function ensureModernLatexMarkedSupport(markedApi) {
  if (modernLatexMarkedExtensionInstalled || typeof markedApi?.use !== 'function') return;
  markedApi.use({ extensions: [MODERN_LATEX_MARKED_EXTENSION] });
  modernLatexMarkedExtensionInstalled = true;
}

function markedRenderOptions(markedApi) {
  ensureModernLatexMarkedSupport(markedApi);
  return {
    gfm: true,
    breaks: false,
    silent: true,
    extensions: markedApi?.defaults?.extensions
  };
}

function renderMath(root) {
  if (typeof renderMathInElement !== 'function') return;
  renderMathInElement(root, {
    delimiters: disableClassicLatexRendering
      ? MODERN_LATEX_DELIMITERS
      : [...MODERN_LATEX_DELIMITERS, ...CLASSIC_LATEX_DELIMITERS],
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

const MARKDOWN_SYNTAX_TOKEN_TYPES = new Set([
  'blockquote',
  'code',
  'del',
  'em',
  'heading',
  'hr',
  'image',
  'link',
  'list',
  'strong',
  'table'
]);

function trimMarkdownSyntaxRange(source, start, end) {
  while (end > start && /\s/.test(source[end - 1])) end -= 1;
  return end > start ? { start, end } : null;
}

function collectMarkdownSyntaxRanges(source, tokens, start, end, output) {
  let cursor = start;
  for (const token of tokens || []) {
    const raw = String(token.raw || '');
    if (!raw) continue;

    const found = source.indexOf(raw, cursor);
    const tokenStart = found >= start && found < end ? found : cursor;
    const tokenEnd = Math.min(end, tokenStart + raw.length);

    if (MARKDOWN_SYNTAX_TOKEN_TYPES.has(token.type)) {
      const range = trimMarkdownSyntaxRange(source, tokenStart, tokenEnd);
      if (range) output.push(range);
    } else if (token.tokens?.length) {
      collectMarkdownSyntaxRanges(source, token.tokens, tokenStart, tokenEnd, output);
    }

    cursor = tokenEnd;
  }
}

function buildMarkdownSyntaxRanges(markdown) {
  const source = String(markdown || '');
  const blockRanges = markdownBlockOffsets(source);
  const ranges = [];

  for (const block of blockRanges) {
    collectMarkdownSyntaxRanges(source, [block.token], block.start, block.end, ranges);
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function applyMarkdownSyntaxColor(root, ranges) {
  if (!ranges.length) return;

  const textNodes = collectEditorTextNodes(root);

  for (const item of textNodes) {
    const length = item.node.nodeValue.length;
    const boundaries = new Set([0, length]);
    for (const range of ranges) {
      if (range.end <= item.start || range.start >= item.end) continue;
      boundaries.add(Math.max(0, range.start - item.start));
      boundaries.add(Math.min(length, range.end - item.start));
    }

    const points = Array.from(boundaries).sort((a, b) => a - b);
    if (points.length === 2 && !ranges.some((range) => range.start < item.end && range.end > item.start)) continue;

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < points.length - 1; index += 1) {
      const segmentStart = points[index];
      const segmentEnd = points[index + 1];
      if (segmentEnd <= segmentStart) continue;

      const absoluteStart = item.start + segmentStart;
      const absoluteEnd = item.start + segmentEnd;
      const text = item.node.nodeValue.slice(segmentStart, segmentEnd);
      const isSyntax = ranges.some((range) => range.start < absoluteEnd && range.end > absoluteStart);

      if (isSyntax) {
        const syntaxSpan = document.createElement('span');
        syntaxSpan.className = 'markdown-syntax';
        syntaxSpan.textContent = text;
        fragment.appendChild(syntaxSpan);
      } else {
        fragment.appendChild(document.createTextNode(text));
      }
    }
    item.node.replaceWith(fragment);
  }
}

function removeMarkdownSyntaxColor(root) {
  for (const syntaxSpan of root.querySelectorAll('.markdown-syntax')) {
    const replacement = document.createDocumentFragment();
    while (syntaxSpan.firstChild) replacement.appendChild(syntaxSpan.firstChild);
    syntaxSpan.replaceWith(replacement);
  }
}

function refreshMarkdownSyntaxColor(caretOffset = null) {
  const markdown = editorTextFromNode(rawEditorEl);
  removeMarkdownSyntaxColor(rawEditorEl);
  applyMarkdownSyntaxColor(rawEditorEl, buildMarkdownSyntaxRanges(markdown));
  restoreSelectionFromTextOffset(rawEditorEl, caretOffset);
}

function renderRawEditor(markdown, item) {
  const ranges = item.rawConfidenceRanges || buildRawHighlightRanges(markdown, item);
  const syntaxRanges = buildMarkdownSyntaxRanges(markdown);
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
  applyMarkdownSyntaxColor(rawEditorEl, syntaxRanges);
}

function markdownBlockOffsets(markdown) {
  const markedApi = window.marked?.marked || window.marked;
  if (!markedApi?.lexer) return [];
  ensureModernLatexMarkedSupport(markedApi);

  const source = String(markdown || '');
  const tokens = markedApi.lexer(source, markedRenderOptions(markedApi));
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
  ensureModernLatexMarkedSupport(markedApi);
  const ranges = markdownBlockOffsets(markdown);
  if (!ranges.length) {
    return markedApi.parse(markdown || '', markedRenderOptions(markedApi));
  }

  return ranges.map((range) => {
    const tokenList = [range.token];
    tokenList.links = range.links || {};
    const parsed = typeof markedApi.parser === 'function'
      ? markedApi.parser(tokenList, markedRenderOptions(markedApi))
      : markedApi.parse(range.raw, markedRenderOptions(markedApi));
    return `<div class="markdown-sync-block" data-md-start="${range.start}" data-md-end="${range.end}">${parsed}</div>`;
  }).join('');
}

function renderMarkdownInto(root, item) {
  const markdown = item.markdown || '';
  const parsed = renderAnchoredMarkdown(markdown);
  const clean = DOMPurify.sanitize(parsed, {
    ADD_ATTR: ['target', 'rel', 'data-md-start', 'data-md-end']
  });

  root.innerHTML = clean;
  resolveRenderedImages(root, item.images || []);
  upgradeLinks(root);
  renderMath(root);
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
    a { color: inherit; text-decoration: none; }
  `;
}

function buildPrintableRenderedHtml() {
  const scratch = document.createElement('div');
  scratch.className = 'markdown-body';
  renderMarkdownInto(scratch, { ...currentItem, markdown: draftMarkdown });
  for (const img of scratch.querySelectorAll('img')) img.removeAttribute('loading');
  return scratch.innerHTML;
}

function printableMetaHtml(item) {
  const parts = [
    tr('original_sha', [item.hash]),
    tr('type_value', [resourceDisplay.previewSummary(item)]),
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

function buildPdfExportHtml({ includeMetadata = false } = {}) {
  const title = currentItem?.name || 'Preview';
  const metadataHeader = includeMetadata ? `
    <header class="print-header">
      <h1>${escapeHtml(title)}</h1>
      <div class="print-meta">${printableMetaHtml(currentItem || {})}</div>
    </header>` : '';
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${chrome.runtime.getURL('vendor/katex/katex.min.css')}">
    <style>${printableStyles()}</style>
  </head>
  <body>
    ${metadataHeader}
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
  titleEl.title = item.name || 'Preview/Edit';
  renameTitleBtn.hidden = false;
  document.title = `${item.name || 'Preview/Edit'} - Mistral OCR`;
  resourceIdentityEl.innerHTML = '';

  const iconUrl = resourceDisplay.iconUrl(item.resourceFormat);
  if (iconUrl) {
    const icon = document.createElement('img');
    icon.className = 'preview-resource-icon';
    icon.src = iconUrl;
    icon.alt = resourceDisplay.previewSummary(item);
    resourceIdentityEl.appendChild(icon);
  }

  const identity = document.createElement('span');
  identity.className = 'preview-resource-label';
  identity.textContent = resourceDisplay.previewSummary(item);
  resourceIdentityEl.appendChild(identity);

  metaEl.innerHTML = '';

  const parts = [
    tr('original_sha', [item.hash]),
    tr('type_value', [resourceDisplay.previewSummary(item)]),
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

function beginRenameTitle() {
  if (!currentItem || !renameTitleBtn || !titleEl.parentElement || titleEl.tagName === 'INPUT') return;

  const originalTitle = titleEl.textContent || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-name-input';
  input.value = currentItem.name || originalTitle;
  input.placeholder = tr('rename_name_placeholder');
  input.setAttribute('aria-label', tr('rename_transcription'));

  let finished = false;
  let saving = false;
  const cancel = () => {
    if (finished) return;
    finished = true;
    input.replaceWith(titleEl);
    renameTitleBtn.hidden = false;
  };
  const save = async () => {
    if (finished || saving) return;
    const validationError = validateTranscriptionName(input.value);
    if (validationError) {
      setStatus(validationError, true);
      input.focus();
      return;
    }

    saving = true;
    const resp = await sendMessage({
      type: 'RENAME_TRANSCRIPTION',
      hash: currentItem.hash,
      name: input.value.trim()
    });
    saving = false;
    if (!resp?.ok || !resp.entry) {
      setStatus(resp?.error || tr('could_not_rename'), true);
      input.focus();
      return;
    }

    finished = true;
    input.replaceWith(titleEl);
    renameTitleBtn.hidden = false;
    currentItem = { ...currentItem, ...resp.entry };
    renderHeader(currentItem);
    setStatus(tr('rename_saved'));
  };

  titleEl.replaceWith(input);
  renameTitleBtn.hidden = true;
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });
  input.addEventListener('blur', save);
  input.focus();
  input.select();
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
  renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown });
  setStatus('');
}

function configureAutoSave(disabled) {
  autoSaveEnabled = disabled !== true;
  saveMdBtn.hidden = autoSaveEnabled;
}

function textNodeAtOffset(root, offset) {
  const entries = collectEditorTextNodes(root);
  const target = Math.max(0, offset);
  let previous = null;

  for (const entry of entries) {
    if (target < entry.start) {
      return previous
        ? { node: previous.node, offset: previous.node.nodeValue.length }
        : { node: entry.node, offset: 0 };
    }
    if (target <= entry.end) {
      return { node: entry.node, offset: target - entry.start };
    }
    previous = entry;
  }

  return previous ? { node: previous.node, offset: previous.node.nodeValue.length } : null;
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

  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const entry = collectEditorTextNodes(root).find((item) => item.node === range.endContainer);
    if (entry) return entry.start + Math.min(range.endOffset, range.endContainer.nodeValue.length);
  }

  const probe = range.cloneRange();
  probe.selectNodeContents(root);
  probe.setEnd(range.endContainer, range.endOffset);
  return probe.toString().length;
}

function restoreSelectionFromTextOffset(root, offset) {
  if (typeof offset !== 'number') return;
  const entries = collectEditorTextNodes(root);
  const target = Math.max(0, offset);
  let previous = null;

  for (const entry of entries) {
    let node = entry.node;
    let nodeOffset;

    if (target < entry.start) {
      node = previous?.node || entry.node;
      nodeOffset = previous ? previous.node.nodeValue.length : 0;
    } else if (target <= entry.end) {
      nodeOffset = target - entry.start;
    } else {
      previous = entry;
      continue;
    }

    const range = document.createRange();
    range.setStart(node, Math.max(0, Math.min(nodeOffset, node.nodeValue.length)));
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function isEditorBlockElement(node) {
  return node.nodeType === Node.ELEMENT_NODE && (node.nodeName === 'DIV' || node.nodeName === 'P');
}

function buildEditorTextModel(root) {
  const entries = [];
  const state = { offset: 0, lastChar: '', text: '' };

  function append(value) {
    if (!value) return;
    state.text += value;
    state.offset += value.length;
    state.lastChar = value[value.length - 1];
  }

  function visit(node, isRoot = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue || '';
      const start = state.offset;
      append(value);
      entries.push({ node, start, end: state.offset });
      return;
    }

    if (node.nodeName === 'BR') {
      append('\n');
      return;
    }

    const isBlock = !isRoot && isEditorBlockElement(node);
    if (isBlock && state.offset > 0 && state.lastChar !== '\n') append('\n');

    for (const child of node.childNodes) visit(child);

    if (isBlock && state.offset > 0 && state.lastChar !== '\n') append('\n');
  }

  visit(root, true);
  return { entries, text: state.text };
}

function collectEditorTextNodes(root) {
  return buildEditorTextModel(root).entries;
}

function editorTextFromNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
  if (node.nodeName === 'BR') return '\n';
  return buildEditorTextModel(node).text;
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
      renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown });
      scheduleRenderedToRawScrollSync();
    });
  }, 650);
}

function clearScrollSyncOrigin() {
  scrollSyncOrigin = '';
}

function syncRenderedToRawScroll() {
  if (scrollSyncOrigin === 'raw') {
    clearScrollSyncOrigin();
    return;
  }

  scrollSyncOrigin = 'rendered';
  rawEditorEl.scrollTop = renderedScrollToRaw(splitRenderedEl.scrollTop);
  requestAnimationFrame(() => {
    if (scrollSyncOrigin === 'rendered') clearScrollSyncOrigin();
  });
}

function syncRawToRenderedScroll() {
  if (scrollSyncOrigin === 'rendered') {
    clearScrollSyncOrigin();
    return;
  }

  scrollSyncOrigin = 'raw';
  splitRenderedEl.scrollTop = rawScrollToRendered(rawEditorEl.scrollTop);
  requestAnimationFrame(() => {
    if (scrollSyncOrigin === 'raw') clearScrollSyncOrigin();
  });
}

function scheduleRenderedToRawScrollSync() {
  if (scrollSyncFrame) cancelAnimationFrame(scrollSyncFrame);
  scrollSyncFrame = requestAnimationFrame(() => {
    scrollSyncFrame = null;
    syncRenderedToRawScroll();
  });
}

function scheduleRawToRenderedScrollSync() {
  if (scrollSyncFrame) cancelAnimationFrame(scrollSyncFrame);
  scrollSyncFrame = requestAnimationFrame(() => {
    scrollSyncFrame = null;
    syncRawToRenderedScroll();
  });
}

function isTouchLikePointer(event) {
  return event?.pointerType === 'touch' || event?.pointerType === 'pen';
}

function clearTouchScrollReleaseTimer() {
  if (!touchScrollReleaseTimer) return;
  clearTimeout(touchScrollReleaseTimer);
  touchScrollReleaseTimer = null;
}

function releaseTouchScrollSource() {
  clearTouchScrollReleaseTimer();
  touchScrollSource = null;
  touchScrollPointerId = null;
  scrollSyncOrigin = '';
}

function scheduleTouchScrollRelease() {
  clearTouchScrollReleaseTimer();
  touchScrollReleaseTimer = setTimeout(() => {
    touchScrollReleaseTimer = null;
    releaseTouchScrollSource();
  }, 260);
}

function beginTouchScrollSource(source, pointerId = null) {
  if (touchScrollSource !== source) {
    touchScrollSource = source;
    touchScrollPointerId = pointerId;
    scrollSyncOrigin = '';
    if (scrollSyncFrame) cancelAnimationFrame(scrollSyncFrame);
    scrollSyncFrame = null;
  }
  scheduleTouchScrollRelease();
}

function scheduleTouchScrollSync(source) {
  if (touchScrollSource !== source) return;
  clearTouchScrollReleaseTimer();
  if (scrollSyncFrame) cancelAnimationFrame(scrollSyncFrame);
  scrollSyncFrame = requestAnimationFrame(() => {
    scrollSyncFrame = null;
    if (touchScrollSource !== source) return;
    if (source === rawEditorEl) {
      syncRawToRenderedScroll();
    } else {
      syncRenderedToRawScroll();
    }
    scheduleTouchScrollRelease();
  });
}

function interpolateBetweenAnchors(position, sourceKey, targetKey) {
  if (scrollAnchors.length < 2) return null;

  const anchors = [...scrollAnchors].sort((a, b) => a[sourceKey] - b[sourceKey]);
  let previous = anchors[0];
  let next = anchors[anchors.length - 1];

  for (let i = 0; i < anchors.length - 1; i++) {
    if (position >= anchors[i][sourceKey] && position <= anchors[i + 1][sourceKey]) {
      previous = anchors[i];
      next = anchors[i + 1];
      break;
    }
  }

  const span = next[sourceKey] - previous[sourceKey];
  const progress = span > 0 ? (position - previous[sourceKey]) / span : 0;
  return previous[targetKey] + (next[targetKey] - previous[targetKey]) * Math.min(1, Math.max(0, progress));
}

function renderedScrollToRaw(renderedTop) {
  const target = interpolateBetweenAnchors(renderedTop, 'renderedTop', 'rawTop');
  if (typeof target === 'number' && Number.isFinite(target)) {
    return target;
  }

  const renderedMax = splitRenderedEl.scrollHeight - splitRenderedEl.clientHeight;
  const rawMax = rawEditorEl.scrollHeight - rawEditorEl.clientHeight;
  const ratio = renderedMax > 0 ? renderedTop / renderedMax : 0;
  return rawMax > 0 ? ratio * rawMax : 0;
}

function rawScrollToRendered(rawTop) {
  const target = interpolateBetweenAnchors(rawTop, 'rawTop', 'renderedTop');
  if (typeof target === 'number' && Number.isFinite(target)) {
    return target;
  }

  const renderedMax = splitRenderedEl.scrollHeight - splitRenderedEl.clientHeight;
  const rawMax = rawEditorEl.scrollHeight - rawEditorEl.clientHeight;
  const ratio = rawMax > 0 ? rawTop / rawMax : 0;
  return renderedMax > 0 ? ratio * renderedMax : 0;
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
  for (const mark of rawEditorEl.querySelectorAll('mark.confidence-low')) {
    if (mark.dataset.confidenceKey !== key) continue;
    const replacement = document.createDocumentFragment();
    while (mark.firstChild) replacement.appendChild(mark.firstChild);
    mark.replaceWith(replacement);
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
    renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown });
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
  renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown });
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
    renderMarkdownInto(splitRenderedEl, { ...currentItem, markdown: draftMarkdown });
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
  setStatus(tr('preparing_pdf'), { tone: 'progress' });

  const settings = await new Promise((resolve) => {
    chrome.storage.local.get(['includePdfMetadata'], resolve);
  });
  const blobUrl = URL.createObjectURL(new Blob([
    buildPdfExportHtml({ includeMetadata: settings.includePdfMetadata === true })
  ], { type: 'text/html' }));
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
  setStatus(tr('saving_changes'), { tone: 'progress' });
  const resp = await sendMessage({
    type: 'SAVE_MARKDOWN',
    hash: currentItem.hash,
    markdown: draftMarkdown
  });
  if (!resp?.ok || !resp.item) {
    setStatus(resp?.error || tr('could_not_save_changes'), true);
    return;
  }

  disableClassicLatexRendering = resp.disableClassicLatexRendering === true;
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
    disableClassicLatexRendering = resp.disableClassicLatexRendering === true;
    currentItem = {
      ...currentItem,
      ...resp.item,
      markdown: draftMarkdown,
      confidenceDecisions: resp.item.confidenceDecisions || currentItem.confidenceDecisions || {}
    };
    setStatus(tr('changes_auto_saved'), { duration: 1500 });
  }, 900);
}

async function load() {
  const hash = getHashFromUrl();
  if (!hash) {
    setStatus(tr('missing_transcription_hash'), true);
    return;
  }

  setStatus(tr('loading_preview'), { tone: 'progress' });
  const resp = await sendMessage({ type: 'GET_PREVIEW_DATA', hash });
  if (!resp?.ok || !resp.item) {
    setStatus(resp?.error || tr('could_not_load_preview'), true);
    return;
  }

  configureAutoSave(resp.previewAutoSaveDisabled === true);
  disableClassicLatexRendering = resp.disableClassicLatexRendering === true;
  renderPreview(resp.item);
}

rawEditorEl.addEventListener('input', () => {
  const caretOffset = textOffsetFromSelection(rawEditorEl);
  readDraftFromEditor();
  persistEditedConfidenceMarks(caretOffset);
  refreshMarkdownSyntaxColor(caretOffset);
  scheduleRenderedRefresh();
  scheduleAutoSave();
});

rawEditorEl.addEventListener('wheel', (event) => {
  event.preventDefault();
  const delta = wheelDeltaPixels(event);
  splitRenderedEl.scrollTop += delta.y;
  splitRenderedEl.scrollLeft += delta.x;
  syncRenderedToRawScroll();
}, { passive: false });

function handleRawScroll() {
  if (touchScrollSource) {
    scheduleTouchScrollSync(rawEditorEl);
    return;
  }
  if (scrollSyncOrigin !== 'rendered') scheduleRawToRenderedScrollSync();
}

function handleRenderedScroll() {
  if (touchScrollSource) {
    scheduleTouchScrollSync(splitRenderedEl);
    return;
  }
  syncRenderedToRawScroll();
}

rawEditorEl.addEventListener('scroll', handleRawScroll);
splitRenderedEl.addEventListener('scroll', handleRenderedScroll);

function handleTouchPointerDown(event) {
  if (!isTouchLikePointer(event)) return;
  beginTouchScrollSource(event.currentTarget, event.pointerId ?? null);
}

function handleTouchPointerRelease(event) {
  if (!touchScrollSource) return;
  if (touchScrollPointerId !== null && event.pointerId !== undefined && event.pointerId !== touchScrollPointerId) return;
  scheduleTouchScrollRelease();
}

function handleTouchStart(event) {
  beginTouchScrollSource(event.currentTarget);
}

function handleTouchEnd() {
  if (touchScrollSource) scheduleTouchScrollRelease();
}

for (const viewer of [rawEditorEl, splitRenderedEl]) {
  viewer.addEventListener('pointerdown', handleTouchPointerDown, { passive: true });
  viewer.addEventListener('pointerup', handleTouchPointerRelease, { passive: true });
  viewer.addEventListener('pointercancel', handleTouchPointerRelease, { passive: true });
  viewer.addEventListener('touchstart', handleTouchStart, { passive: true });
  viewer.addEventListener('touchend', handleTouchEnd, { passive: true });
  viewer.addEventListener('touchcancel', handleTouchEnd, { passive: true });
}

rawEditorEl.addEventListener('mouseover', (event) => {
  const mark = event.target.closest?.('.confidence-low');
  if (mark) showConfidencePopover(mark);
});

rawEditorEl.addEventListener('mouseout', (event) => {
  if (event.target.closest?.('.confidence-low')) scheduleHideConfidencePopover();
});

confidencePopoverEl.addEventListener('mouseover', () => clearTimeout(hidePopoverTimer));
confidencePopoverEl.addEventListener('mouseout', scheduleHideConfidencePopover);
confidenceKeepBtn.addEventListener('click', () => persistConfidenceDecision(activeConfidenceKey));
statusDismissBtn.addEventListener('click', () => setStatus(''));
detailsToggleBtn.addEventListener('click', () => {
  setPreviewDetailsExpanded(previewDetailsEl.hidden, { persist: true });
});
saveMdBtn.addEventListener('click', saveMarkdown);
copyRawBtn.addEventListener('click', copyRaw);
exportMdBtn.addEventListener('click', () => {
  closeExportMenu();
  void exportMarkdown();
});
exportPdfBtn.addEventListener('click', () => {
  closeExportMenu();
  void exportRenderedPdf();
});
exportImagesBtn.addEventListener('click', () => {
  closeExportMenu();
  void exportImages();
});
renameTitleBtn.addEventListener('click', beginRenameTitle);

document.addEventListener('click', (event) => {
  if (exportMenuEl.open && !exportMenuEl.contains(event.target)) closeExportMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && exportMenuEl.open) {
    event.preventDefault();
    closeExportMenu({ restoreFocus: true });
  }
});

if (typeof ResizeObserver === 'function') {
  viewerResizeObserver = new ResizeObserver(scheduleAnchorBuild);
  viewerResizeObserver.observe(splitModeEl);
  viewerResizeObserver.observe(rawEditorEl);
  viewerResizeObserver.observe(splitRenderedEl);
} else {
  window.addEventListener('resize', scheduleAnchorBuild);
}

void loadPreviewDetailsPreference();
void load();
