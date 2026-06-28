'use strict';

const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');
const btnRun = document.getElementById('btnRun');
const existInfo = document.getElementById('existInfo');
const resourceInfoEl = document.getElementById('resourceInfo');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const openOptions = document.getElementById('openOptions');
const headerOpenOptions = document.getElementById('headerOpenOptions');
const setupGuideEl = document.getElementById('setupGuide');
const setupOpenOptionsBtn = document.getElementById('setupOpenOptions');
const ocrControlsEl = document.getElementById('ocrControls');
const chkImages = document.getElementById('chkImages');
const apiKeySelectWrapEl = document.getElementById('apiKeySelectWrap');
const apiKeySelectEl = document.getElementById('apiKeySelect');
const jobBoxEl = document.getElementById('jobBox');
const jobStatusEl = document.getElementById('jobStatus');
const btnCancelJob = document.getElementById('btnCancelJob');
const googleFormatSwitchEl = document.getElementById('googleFormatSwitch');
const googleFormatOptionsEl = document.getElementById('googleFormatOptions');
const MAX_POPUP_TRANSCRIPTIONS = 2;
const tr = window.t || ((key) => key);

let current = {
  resourceUrl: null,
  resourceKind: null,
  resourceLabel: null,
  isOcrable: false,
  embeddedPdfUrl: null,
  exists: { found: false },
  hasApiKey: false,
  hasSecondaryApiKey: false,
  activeApiKeySlot: 'key1',
  apiKeyOptions: [],
  includeImages: true,
  googleExportFormat: 'pdf',
  googleExportOptions: [],
  showGoogleExportFormatSelector: false,
  activeJob: null
};
let pollTimer = null;

function setStatus(msg, tone = false) {
  statusEl.textContent = msg || '';
  const statusTone = tone === true ? 'error' : tone;
  statusEl.className = statusTone ? `small status-line ${statusTone}` : 'small status-line';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderList(items) {
  listEl.innerHTML = '';
  if (!items || items.length === 0) {
    listEl.innerHTML = `<div class="small">${escapeHtml(tr('no_previous_transcriptions'))}</div>`;
    return;
  }
  const visibleItems = items.slice(0, MAX_POPUP_TRANSCRIPTIONS);
  for (const it of visibleItems) {
    const div = document.createElement('div');
    div.className = 'entry popup-entry';
    const when = new Date(it.updatedAt || it.createdAt).toLocaleString();
    div.innerHTML = `
      <div class="entry-title">${escapeHtml(it.name)}</div>
      <div class="small">${escapeHtml(tr('updated_at', [when]))}</div>
      <div class="actions">
        <button data-act="preview" data-hash="${escapeHtml(it.hash)}">Preview/Edit</button>
        <button data-act="copy" data-hash="${escapeHtml(it.hash)}">${escapeHtml(tr('copy_content'))}</button>
        <button data-act="export-images" data-hash="${escapeHtml(it.hash)}">${escapeHtml(tr('export_images'))}</button>
        <button class="danger" data-act="delete" data-hash="${escapeHtml(it.hash)}">${escapeHtml(tr('delete'))}</button>
      </div>
    `;
    listEl.appendChild(div);
  }
  if (items.length > visibleItems.length) {
    const summary = document.createElement('div');
    summary.className = 'small popup-list-summary';
    summary.textContent = tr('showing_recent_transcriptions', [String(visibleItems.length), String(items.length)]);
    listEl.appendChild(summary);
  }
}

function updateResourceInfo() {
  if (!current.resourceKind || !current.resourceLabel) {
    resourceInfoEl.textContent = tr('current_tab_not_supported');
    return;
  }
  resourceInfoEl.textContent = tr('current_tab_resource', [current.resourceLabel]);
}

function updateExistInfo() {
  if (!current.isOcrable) {
    if (current.embeddedPdfUrl) {
      existInfo.textContent = tr('embedded_pdf_detected');
    } else {
      existInfo.textContent = tr('open_compatible_resource');
    }
    return;
  }
  if (!current.resourceUrl) {
    existInfo.textContent = tr('no_ocr_url_detected');
    return;
  }
  if (current.exists?.found) {
    const formatHint = current.exists.matchedUrl && current.exists.matchedUrl !== current.resourceUrl
      ? tr('existing_other_export_format')
      : '';
    existInfo.innerHTML = `
      ${escapeHtml(tr('ocr_exists_for_document', [formatHint]))}
      <button id="previewCurrentMd" type="button">Preview/Edit</button>
      <button id="copyCurrentMd" type="button">${escapeHtml(tr('copy_content'))}</button>
    `;
    setTimeout(() => {
      document.getElementById('previewCurrentMd')?.addEventListener('click', () => {
        window.open(`preview.html?hash=${encodeURIComponent(current.exists.hash)}`, '_blank');
      });
      document.getElementById('copyCurrentMd')?.addEventListener('click', () => copyMd(current.exists.hash));
    }, 0);
  } else {
    existInfo.textContent = tr('no_previous_ocr_for_document');
  }
}

function updateRunButton() {
  if (current.activeJob) {
    btnRun.textContent = tr('processing');
    return;
  }
  btnRun.textContent = current.exists?.found ? tr('overwrite') : tr('run_ocr');
}

function renderApiKeySelector() {
  const showSelector = current.hasSecondaryApiKey && current.apiKeyOptions.length > 1;
  apiKeySelectWrapEl.classList.toggle('hidden', !showSelector);
  apiKeySelectEl.innerHTML = '';
  for (const option of current.apiKeyOptions) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    apiKeySelectEl.appendChild(el);
  }
  apiKeySelectEl.value = current.activeApiKeySlot;
}

function renderSetupGuide() {
  setupGuideEl.classList.toggle('hidden', current.hasApiKey);
}

function findGoogleExportOption(format) {
  return current.googleExportOptions.find((option) => option.value === format) || null;
}

function applyGoogleExportOption(option) {
  if (!option) return;
  current.googleExportFormat = option.value;
  current.resourceUrl = option.resourceUrl || current.resourceUrl;
  current.resourceLabel = option.resourceLabel || current.resourceLabel;
  current.isOcrable = true;
}

function existingCandidateUrls() {
  return Array.from(new Set([
    current.resourceUrl,
    ...current.googleExportOptions.map((option) => option.resourceUrl)
  ].filter(Boolean)));
}

function renderLastOcrJobNotice(notice) {
  if (!notice?.message) return;
  const subject = notice.displayName ? `${notice.title || 'OCR'}: ${notice.displayName}` : (notice.title || 'OCR');
  setStatus(`${subject} - ${notice.message}`, notice.level === 'warning' ? 'warning' : 'error');
}

function renderGoogleFormatSelector() {
  const showSelector = current.showGoogleExportFormatSelector && current.googleExportOptions.length > 1;
  googleFormatSwitchEl.classList.toggle('hidden', !showSelector);
  googleFormatOptionsEl.innerHTML = '';
  if (!showSelector) return;

  for (const option of current.googleExportOptions) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    const text = document.createElement('span');
    input.type = 'radio';
    input.name = 'googleExportFormat';
    input.value = option.value;
    input.checked = option.value === current.googleExportFormat;
    input.disabled = !!current.activeJob;
    text.textContent = option.label;
    label.append(input, text);
    googleFormatOptionsEl.appendChild(label);
  }
}

function renderActiveJob() {
  const job = current.activeJob;
  const isActive = !!job && (job.status === 'starting' || job.status === 'running');
  jobBoxEl.classList.toggle('hidden', !isActive);
  if (!isActive) {
    jobStatusEl.textContent = '';
    return;
  }

  const subject = job.displayName || job.resourceLabel || tr('resource_document');
  const stage = job.step || tr('processing');
  const detail = job.message || '';
  jobStatusEl.textContent = `${subject}: ${stage}${detail ? ` - ${detail}` : ''}`;
}

function ensurePolling() {
  const shouldPoll = !!current.activeJob && (current.activeJob.status === 'starting' || current.activeJob.status === 'running');
  if (!shouldPoll) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    return;
  }
  if (pollTimer) return;
  pollTimer = setInterval(refreshActiveJob, 1500);
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

async function init({ isRefresh = false } = {}) {
  setStatus(isRefresh ? tr('refreshing') : tr('loading'));
  const resp = await sendMessage({ type: 'INIT' });
  setStatus('');
  if (!resp?.ok) {
    setStatus(resp?.error || tr('error_initializing'), true);
    return;
  }

  current.resourceUrl = resp.resourceUrl;
  current.resourceKind = resp.resourceKind || null;
  current.resourceLabel = resp.resourceLabel || null;
  current.isOcrable = !!resp.isOcrable;
  current.embeddedPdfUrl = resp.embeddedPdfUrl || null;
  current.exists = resp.exists;
  current.hasApiKey = !!resp.hasApiKey;
  current.hasSecondaryApiKey = !!resp.hasSecondaryApiKey;
  current.activeApiKeySlot = resp.activeApiKeySlot === 'key2' ? 'key2' : 'key1';
  current.apiKeyOptions = Array.isArray(resp.apiKeyOptions) ? resp.apiKeyOptions : [];
  current.includeImages = resp.includeImages !== false;
  current.googleExportFormat = resp.googleExportFormat || 'pdf';
  current.googleExportOptions = Array.isArray(resp.googleExportOptions) ? resp.googleExportOptions : [];
  current.showGoogleExportFormatSelector = resp.showGoogleExportFormatSelector === true;
  current.activeJob = resp.activeJob || null;

  const activeLabel = current.apiKeyOptions.find((option) => option.value === current.activeApiKeySlot)?.label;
  apiKeyStatus.textContent = current.hasApiKey
    ? (activeLabel ? tr('api_key_configured_with_label', [activeLabel]) : tr('api_key_configured'))
    : tr('api_key_not_configured');

  const canOcr = current.isOcrable || !!current.embeddedPdfUrl;
  ocrControlsEl.classList.toggle('hidden', !canOcr);

  btnRun.disabled = !!current.activeJob || !canOcr || !current.hasApiKey;

  chkImages.checked = current.includeImages;

  renderSetupGuide();
  updateResourceInfo();
  updateExistInfo();
  updateRunButton();
  renderApiKeySelector();
  renderGoogleFormatSelector();
  renderActiveJob();
  ensurePolling();
  renderList(resp.list);
  if (resp.lastOcrJobNotice && !current.activeJob) renderLastOcrJobNotice(resp.lastOcrJobNotice);
}

async function runOcr() {
  const forceOverwrite = !!current.exists?.found;
  setStatus(forceOverwrite ? tr('starting_overwrite_background') : tr('starting_ocr_background'));
  const googleExportFormatOverrides = current.resourceKind && current.googleExportFormat
    ? { [current.resourceKind]: current.googleExportFormat }
    : {};
  const resp = await sendMessage({ type: 'START_OCR_JOB', forceOverwrite, googleExportFormatOverrides });
  if (!resp?.ok) {
    setStatus(resp?.error || tr('error_in_ocr'), true);
    return;
  }
  if (resp.immediate && resp.result) {
    setStatus(tr('resource_already_processed_copying'));
    await copyMd(resp.result.hash);
    await init({ isRefresh: true });
    return;
  }
  await init({ isRefresh: true });
  setStatus(tr('ocr_background_started'));
}

async function deleteEntry(hash) {
  const resp = await sendMessage({ type: 'DELETE_ENTRY', hash });
  if (!resp?.ok) {
    setStatus(resp?.error || tr('could_not_delete'), true);
    return;
  }
  await init({ isRefresh: true });
  setStatus(tr('deleted_from_list'));
}

async function copyMd(hash) {
  const resp = await sendMessage({ type: 'GET_MD', hash });
  if (!resp?.ok || !resp.content) {
    setStatus(resp?.error || tr('could_not_get_content'), true);
    return;
  }
  try {
    await navigator.clipboard.writeText(resp.content);
    setStatus(tr('content_copied'));
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = resp.content;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setStatus(tr('content_copied_fallback'));
  }
}

async function exportMarkdown(hash) {
  const resp = await sendMessage({ type: 'EXPORT_MARKDOWN', hash });
  if (!resp?.ok) {
    setStatus(resp?.error || tr('could_not_export_markdown'), true);
    return;
  }
  setStatus(tr('markdown_exported'));
}

async function exportImages(hash) {
  const resp = await sendMessage({ type: 'EXPORT_IMAGES', hash });
  if (!resp?.ok) {
    setStatus(resp?.error || tr('could_not_export_images'), true);
    return;
  }
  setStatus(tr('images_exported'));
}

async function cancelActiveJob() {
  const resp = await sendMessage({ type: 'CANCEL_ACTIVE_OCR_JOB' });
  if (!resp?.ok) {
    setStatus(resp?.error || tr('could_not_cancel_ocr'), true);
    return;
  }
  setStatus(tr('canceling_background_ocr'));
}

async function refreshActiveJob() {
  const resp = await sendMessage({ type: 'GET_ACTIVE_OCR_JOB' });
  if (!resp?.ok) return;
  const hadActiveJob = !!current.activeJob;
  current.activeJob = resp.activeJob || null;
  btnRun.disabled = !!current.activeJob || !(current.isOcrable || !!current.embeddedPdfUrl) || !current.hasApiKey;
  updateRunButton();
  renderActiveJob();
  ensurePolling();
  if (hadActiveJob && !current.activeJob) {
    await init({ isRefresh: true });
  }
}

// Eventos UI
btnRun.addEventListener('click', runOcr);
btnCancelJob.addEventListener('click', cancelActiveJob);

chkImages.addEventListener('change', async () => {
  const value = !!chkImages.checked;
  await sendMessage({ type: 'SET_INCLUDE_IMAGES', value });
});

apiKeySelectEl.addEventListener('change', async () => {
  const value = apiKeySelectEl.value === 'key2' ? 'key2' : 'key1';
  const resp = await sendMessage({ type: 'SET_ACTIVE_API_KEY_SLOT', value });
  if (!resp?.ok) {
    setStatus(resp?.error || tr('could_not_change_active_api_key'), true);
    return;
  }
  current.activeApiKeySlot = resp.activeApiKeySlot === 'key2' ? 'key2' : 'key1';
  const activeLabel = current.apiKeyOptions.find((option) => option.value === current.activeApiKeySlot)?.label;
  apiKeyStatus.textContent = current.hasApiKey
    ? (activeLabel ? tr('api_key_configured_with_label', [activeLabel]) : tr('api_key_configured'))
    : tr('api_key_not_configured');
});

googleFormatOptionsEl.addEventListener('change', async (e) => {
  const input = e.target.closest('input[name="googleExportFormat"]');
  if (!input) return;
  const option = findGoogleExportOption(input.value);
  if (!option) return;

  applyGoogleExportOption(option);
  updateResourceInfo();
  setStatus(tr('updating_format'));
  const resp = await sendMessage({ type: 'CHECK_EXISTING_FOR_URL', url: current.resourceUrl, urls: existingCandidateUrls() });
  setStatus('');
  if (!resp?.ok) {
    setStatus(resp?.error || tr('could_not_check_previous_ocr_format'), true);
    current.exists = { found: false };
  } else {
    current.exists = resp.exists || { found: false };
  }
  updateExistInfo();
  updateRunButton();
  renderGoogleFormatSelector();
});

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const hash = btn.getAttribute('data-hash');
  const act = btn.getAttribute('data-act');
  if (act === 'preview') window.open(`preview.html?hash=${encodeURIComponent(hash)}`, '_blank');
  if (act === 'delete') deleteEntry(hash);
  if (act === 'copy') copyMd(hash);
  if (act === 'export-md') exportMarkdown(hash);
  if (act === 'export-images') exportImages(hash);
});

openOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

headerOpenOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

setupOpenOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

window.addEventListener('unload', () => {
  if (pollTimer) clearInterval(pollTimer);
});

init();
