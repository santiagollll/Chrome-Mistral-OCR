'use strict';

const statusEl = document.getElementById('status');
const ocrErrorEl = document.getElementById('ocrError');
const ocrErrorCodeEl = document.getElementById('ocrErrorCode');
const ocrErrorDescriptionEl = document.getElementById('ocrErrorDescription');
const ocrAccessHelpEl = document.getElementById('ocrAccessHelp');
const ocrAccessReasonEl = document.getElementById('ocrAccessReason');
const ocrAccessHttpStatusEl = document.getElementById('ocrAccessHttpStatus');
const ocrAccessMistralCodeEl = document.getElementById('ocrAccessMistralCode');
const ocrAccessDescriptionEl = document.getElementById('ocrAccessDescription');
const listEl = document.getElementById('list');
const btnRun = document.getElementById('btnRun');
const existInfo = document.getElementById('existInfo');
const resourceInfoEl = document.getElementById('resourceInfo');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const apiKeySummaryEl = document.getElementById('apiKeySummary');
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
const resourceStatusEl = document.getElementById('resourceStatus');
const resourceIconEl = document.getElementById('resourceIcon');
const imagesPreferenceEl = chkImages.closest('label');
const fileUrlAccessWarningEl = document.getElementById('fileUrlAccessWarning');
const openFileUrlAccessBtn = document.getElementById('openFileUrlAccess');
const MAX_POPUP_TRANSCRIPTIONS = 2;
const tr = window.t || ((key) => key);
const formatIconAssets = Object.freeze({
  pdf: 'assets/pdf.png',
  docx: 'assets/doc.png',
  pptx: 'assets/ppt.png',
  xlsx: 'assets/xls.png',
  csv: 'assets/csv.png'
});

let current = {
  resourceUrl: null,
  resourceKind: null,
  resourceFormat: null,
  resourceOrigin: null,
  resourceProvider: null,
  resourceLabel: null,
  resourceDisplayLabel: null,
  resourceIconUrl: null,
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
  fileUrlAccessBlocked: false,
  activeJob: null
};
let pollTimer = null;

resourceIconEl.addEventListener('error', () => {
  resourceIconEl.removeAttribute('src');
  resourceIconEl.classList.add('hidden');
});

function setStatus(msg, tone = false) {
  statusEl.textContent = msg || '';
  const statusTone = tone === true ? 'error' : tone;
  statusEl.className = statusTone ? `small status-line ${statusTone}` : 'small status-line';
}

const accessErrorCategories = new Set([
  'NO_ACTIVE_USAGE_LIMIT',
  'RATE_LIMIT_REACHED',
  'PAYMENT_REQUIRED'
]);

const accessErrorReasonKeys = {
  NO_ACTIVE_USAGE_LIMIT: 'ocr_access_reason_no_active_usage_limit',
  RATE_LIMIT_REACHED: 'ocr_access_reason_rate_limit_reached',
  PAYMENT_REQUIRED: 'ocr_access_reason_payment_required'
};

const accessErrorStatusKeys = {
  NO_ACTIVE_USAGE_LIMIT: 'ocr_access_status_no_active_usage_limit',
  RATE_LIMIT_REACHED: 'ocr_access_status_rate_limit_reached',
  PAYMENT_REQUIRED: 'ocr_access_status_payment_required'
};

function getAccessErrorCategory(notice) {
  const category = notice?.category || notice?.errorCategory;
  return accessErrorCategories.has(category) ? category : null;
}

function clearOcrAccessHelp() {
  ocrAccessHelpEl.classList.add('hidden');
  ocrAccessReasonEl.textContent = '';
  ocrAccessHttpStatusEl.textContent = '';
  ocrAccessMistralCodeEl.textContent = '';
  ocrAccessDescriptionEl.textContent = '';
}

function renderOcrError(notice) {
  const isError = notice?.level === 'error'
    || (notice?.code && notice.code !== 'CANCELED' && notice.code !== 'cancelled');
  if (!isError) {
    ocrErrorEl.classList.add('hidden');
    ocrErrorCodeEl.textContent = '';
    ocrErrorDescriptionEl.textContent = '';
    clearOcrAccessHelp();
    return;
  }

  const category = getAccessErrorCategory(notice);
  if (category) {
    ocrErrorEl.classList.add('hidden');
    ocrErrorCodeEl.textContent = '';
    ocrErrorDescriptionEl.textContent = '';
    ocrAccessReasonEl.textContent = tr(accessErrorReasonKeys[category]);
    ocrAccessHttpStatusEl.textContent = String(notice.httpStatus ?? notice.status ?? '—');
    ocrAccessMistralCodeEl.textContent = String(notice.mistralCode || '—');
    ocrAccessDescriptionEl.textContent = String(
      notice.description || notice.errorDescription || notice.message || tr('error_background_ocr_failed')
    );
    ocrAccessHelpEl.classList.remove('hidden');
    return;
  }

  clearOcrAccessHelp();
  ocrErrorCodeEl.textContent = String(notice.code || notice.errorCode || 'OCR_ERROR');
  ocrErrorDescriptionEl.textContent = String(
    notice.description || notice.errorDescription || notice.message || tr('error_background_ocr_failed')
  );
  ocrErrorEl.classList.remove('hidden');
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
  const hasResource = !!(current.resourceKind && (current.resourceDisplayLabel || current.resourceLabel));
  resourceStatusEl.classList.toggle('hidden', !hasResource);
  if (!hasResource) {
    resourceInfoEl.textContent = '';
    resourceIconEl.removeAttribute('src');
    resourceIconEl.classList.add('hidden');
    return;
  }
  resourceInfoEl.textContent = tr('resource_indicator', [current.resourceDisplayLabel || current.resourceLabel]);
  if (current.resourceIconUrl) {
    resourceIconEl.src = current.resourceIconUrl;
    resourceIconEl.classList.remove('hidden');
  } else {
    resourceIconEl.removeAttribute('src');
    resourceIconEl.classList.add('hidden');
  }
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
    const existsMessage = current.resourceOrigin === 'google'
      ? tr('ocr_exists_for_document_format', [existingFormatLabel()])
      : tr('ocr_exists_generic');
    existInfo.innerHTML = `
      ${escapeHtml(existsMessage)}
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
  btnRun.textContent = hasExistingForSelectedFormat() ? tr('overwrite') : tr('run_ocr');
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

function renderFileUrlAccessWarning() {
  fileUrlAccessWarningEl.classList.toggle('hidden', !current.fileUrlAccessBlocked);
}

function findGoogleExportOption(format) {
  return current.googleExportOptions.find((option) => option.value === format) || null;
}

function hasExistingForSelectedFormat() {
  if (!current.exists?.found) return false;
  if (!current.googleExportOptions.length) return true;
  return current.exists.matchedUrl === current.resourceUrl;
}

function existingFormatLabel() {
  const matchedOption = current.googleExportOptions.find((option) => option.resourceUrl === current.exists?.matchedUrl);
  if (matchedOption?.label) return matchedOption.label;
  const selectedOption = findGoogleExportOption(current.googleExportFormat);
  if (selectedOption?.label && current.exists?.matchedUrl === current.resourceUrl) return selectedOption.label;
  return current.resourceLabel || tr('resource_document');
}

function applyGoogleExportOption(option) {
  if (!option) return;
  current.googleExportFormat = option.value;
  current.resourceFormat = option.value;
  current.resourceUrl = option.resourceUrl || current.resourceUrl;
  current.resourceLabel = option.resourceLabel || current.resourceLabel;
  current.resourceDisplayLabel = option.resourceDisplayLabel || current.resourceDisplayLabel;
  current.isOcrable = true;
  renderImagesPreference();
}

function renderImagesPreference() {
  imagesPreferenceEl?.classList.toggle('hidden', current.resourceFormat === 'csv');
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
  renderOcrError(notice);
  const category = getAccessErrorCategory(notice);
  const statusMessage = category
    ? tr(accessErrorStatusKeys[category])
    : notice.message;
  setStatus(`${subject} - ${statusMessage}`, category || notice.level === 'warning' ? 'warning' : 'error');
}

function renderGoogleFormatSelector() {
  const showSelector = current.showGoogleExportFormatSelector && current.googleExportOptions.length > 1;
  googleFormatSwitchEl.classList.toggle('hidden', !showSelector);
  googleFormatOptionsEl.innerHTML = '';
  if (!showSelector) return;

  for (const option of current.googleExportOptions) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    const content = document.createElement('span');
    const iconPath = formatIconAssets[option.value];
    content.className = 'format-option-content';
    input.type = 'radio';
    input.name = 'googleExportFormat';
    input.value = option.value;
    input.checked = option.value === current.googleExportFormat;
    input.disabled = !!current.activeJob;
    if (iconPath) {
      const icon = document.createElement('img');
      icon.className = 'format-option-icon';
      icon.src = chrome.runtime.getURL(iconPath);
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      content.appendChild(icon);
    }
    const text = document.createElement('span');
    text.className = 'format-option-label';
    text.textContent = option.label;
    content.appendChild(text);
    label.append(input, content);
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
      if (err) return resolve({ ok: false, error: window.getUserFacingError?.(err.message) || err.message });
      if (response?.error) return resolve({ ...response, error: window.getUserFacingError?.(response.error) || response.error });
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
  current.resourceFormat = resp.resourceFormat || null;
  current.resourceOrigin = resp.resourceOrigin || null;
  current.resourceProvider = resp.resourceProvider || null;
  current.resourceLabel = resp.resourceLabel || null;
  current.resourceDisplayLabel = resp.resourceDisplayLabel || current.resourceLabel || null;
  current.resourceIconUrl = resp.resourceIconUrl || null;
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
  current.fileUrlAccessBlocked = resp.fileUrlAccessBlocked === true;
  current.activeJob = resp.activeJob || null;

  const activeLabel = current.apiKeyOptions.find((option) => option.value === current.activeApiKeySlot)?.label;
  apiKeyStatus.textContent = current.hasApiKey
    ? (activeLabel ? tr('api_key_configured_with_label', [activeLabel]) : tr('api_key_configured'))
    : tr('api_key_not_configured');
  apiKeySummaryEl.classList.toggle('hidden', current.hasApiKey);

  const canOcr = current.isOcrable || !!current.embeddedPdfUrl;
  ocrControlsEl.classList.toggle('hidden', !canOcr);

  btnRun.disabled = !!current.activeJob || !canOcr || !current.hasApiKey || current.fileUrlAccessBlocked;

  chkImages.checked = current.includeImages;
  renderImagesPreference();

  renderSetupGuide();
  renderFileUrlAccessWarning();
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
  if (current.fileUrlAccessBlocked) {
    renderFileUrlAccessWarning();
    setStatus(tr('error_file_url_access_required'), true);
    return;
  }
  const forceOverwrite = hasExistingForSelectedFormat();
  renderOcrError(null);
  setStatus(forceOverwrite ? tr('starting_overwrite_background') : tr('starting_ocr_background'));
  const googleExportFormatOverrides = current.resourceKind && current.googleExportFormat
    ? { [current.resourceKind]: current.googleExportFormat }
    : {};
  const resp = await sendMessage({ type: 'START_OCR_JOB', forceOverwrite, googleExportFormatOverrides });
  if (!resp?.ok) {
    if (resp.errorCode === 'FILE_URL_ACCESS_REQUIRED') {
      await init({ isRefresh: true });
    }
    renderOcrError(resp);
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
  btnRun.disabled = !!current.activeJob || !(current.isOcrable || !!current.embeddedPdfUrl) || !current.hasApiKey || current.fileUrlAccessBlocked;
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

openFileUrlAccessBtn.addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: `chrome://extensions/?id=${encodeURIComponent(chrome.runtime.id)}` });
  } catch (error) {
    setStatus(error?.message || tr('error_open_extension_settings'), true);
  }
});

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
  const savedPreference = await sendMessage({
    type: 'SET_GOOGLE_EXPORT_FORMAT',
    kind: current.resourceKind,
    format: current.googleExportFormat
  });
  if (!savedPreference?.ok) {
    setStatus(savedPreference?.error || tr('could_not_check_previous_ocr_format'), true);
  }
  const resp = await sendMessage({ type: 'CHECK_EXISTING_FOR_URL', url: current.resourceUrl, urls: existingCandidateUrls() });
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
