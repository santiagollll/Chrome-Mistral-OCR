'use strict';

const apiKey1El = document.getElementById('apiKey1');
const apiKey2El = document.getElementById('apiKey2');
const apiKey1LabelEl = document.getElementById('apiKey1Label');
const apiKey2LabelEl = document.getElementById('apiKey2Label');
const saveBtn = document.getElementById('save');
const toggleVisibility1Btn = document.getElementById('toggleVisibility1');
const toggleVisibility2Btn = document.getElementById('toggleVisibility2');
const imageExportModeEl = document.getElementById('imageExportMode');
const previewAutoSaveDisabledEl = document.getElementById('previewAutoSaveDisabled');
const removeDocumentHeaderEl = document.getElementById('removeDocumentHeader');
const removeDocumentFooterEl = document.getElementById('removeDocumentFooter');
const googleDocsDocxEnabledEl = document.getElementById('googleDocsDocxEnabled');
const googleSlidesPptxEnabledEl = document.getElementById('googleSlidesPptxEnabled');
const googleSheetsNativeEnabledEl = document.getElementById('googleSheetsNativeEnabled');
const googleSheetsExportFormatEl = document.getElementById('googleSheetsExportFormat');
const customIconUrlEl = document.getElementById('customIconUrl');
const applyCustomIconBtn = document.getElementById('applyCustomIcon');
const resetCustomIconBtn = document.getElementById('resetCustomIcon');
const msgEl = document.getElementById('msg');
const setupGuideEl = document.getElementById('setupGuide');
const helpToggleButtons = document.querySelectorAll('[data-help-toggle]');
const tr = window.t || ((key) => key);

const DEFAULT_KEY_1_LABEL = 'API KEY 1';
const DEFAULT_KEY_2_LABEL = 'API KEY 2';

function setMsg(t, isErr = false) {
  msgEl.textContent = t || '';
  msgEl.className = t ? (isErr ? 'small message error' : 'small message success') : 'small message';
}

function updateGoogleSheetsExportFormatState() {
  googleSheetsExportFormatEl.disabled = !googleSheetsNativeEnabledEl.checked;
}

function updateSetupGuideState() {
  const hasAnyApiKey = !!apiKey1El.value.trim() || !!apiKey2El.value.trim();
  setupGuideEl.classList.toggle('hidden', hasAnyApiKey);
}

function isValidPngUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.pathname.toLowerCase().endsWith('.png');
  } catch {
    return false;
  }
}

function drawBitmapContained(ctx, bitmap, size) {
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
  const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
  const offsetX = Math.round((size - drawWidth) / 2);
  const offsetY = Math.round((size - drawHeight) / 2);
  ctx.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight);
}

async function rasterizePngUrl(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  if (!/^image\/png(?:$|;)/i.test(blob.type || 'image/png')) {
    throw new Error('not-png');
  }

  const bitmap = await createImageBitmap(blob);
  const pngs = {};
  for (const size of [16, 32, 48, 128]) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.clearRect(0, 0, size, size);
    drawBitmapContained(ctx, bitmap, size);
    pngs[String(size)] = canvas.toDataURL('image/png');
  }
  return pngs;
}

async function applyCustomIcon() {
  const iconUrl = customIconUrlEl.value.trim();
  if (!iconUrl) {
    setMsg('Enter a PNG URL first.', true);
    return;
  }
  if (!isValidPngUrl(iconUrl)) {
    setMsg('Only direct HTTPS .png URLs are supported.', true);
    return;
  }

  setMsg('Processing icon...');
  try {
    const pngs = await rasterizePngUrl(iconUrl);
    const resp = await chrome.runtime.sendMessage({
      type: 'SET_CUSTOM_ACTION_ICON',
      iconUrl,
      pngs
    });
    if (!resp?.ok) {
      setMsg(resp?.error || 'Could not apply the custom icon.', true);
      return;
    }
    await window.refreshDocumentIcon?.();
    setMsg('Custom icon applied.');
  } catch (error) {
    setMsg(error?.message === 'not-png' ? 'The URL must return a PNG image.' : (error?.message || 'Could not process the icon URL.'), true);
  }
}

async function resetCustomIcon() {
  const resp = await chrome.runtime.sendMessage({ type: 'RESET_CUSTOM_ACTION_ICON' });
  if (!resp?.ok) {
    setMsg(resp?.error || 'Could not reset the icon.', true);
    return;
  }
  customIconUrlEl.value = '';
  await window.refreshDocumentIcon?.();
  setMsg('Default icon restored.');
}

async function load() {
  chrome.storage.local.get([
    'apiKey',
    'apiKey1',
    'apiKey2',
    'apiKey1Label',
    'apiKey2Label',
    'imageExportMode',
    'previewAutoSaveDisabled',
    'removeDocumentHeader',
    'removeDocumentFooter',
    'googleDocsDocxEnabled',
    'googleSlidesPptxEnabled',
    'googleSheetsNativeEnabled',
    'googleNativeExportsEnabled',
    'googleSheetsExportFormat',
    'customActionIconUrl'
  ], ({
    apiKey,
    apiKey1,
    apiKey2,
    apiKey1Label,
    apiKey2Label,
    imageExportMode,
    previewAutoSaveDisabled,
    removeDocumentHeader,
    removeDocumentFooter,
    googleDocsDocxEnabled,
    googleSlidesPptxEnabled,
    googleSheetsNativeEnabled,
    googleNativeExportsEnabled,
    googleSheetsExportFormat,
    customActionIconUrl
  }) => {
    apiKey1El.value = (apiKey1 || apiKey || '').trim();
    apiKey2El.value = (apiKey2 || '').trim();
    apiKey1LabelEl.value = (apiKey1Label || DEFAULT_KEY_1_LABEL).trim();
    apiKey2LabelEl.value = (apiKey2Label || DEFAULT_KEY_2_LABEL).trim();
    imageExportModeEl.value = imageExportMode === 'separate' ? 'separate' : 'zip';
    previewAutoSaveDisabledEl.checked = previewAutoSaveDisabled === true;
    removeDocumentHeaderEl.checked = removeDocumentHeader === true;
    removeDocumentFooterEl.checked = removeDocumentFooter === true;
    const legacyGoogleNativeEnabled = googleNativeExportsEnabled === true;
    googleDocsDocxEnabledEl.checked = googleDocsDocxEnabled === true || (googleDocsDocxEnabled == null && legacyGoogleNativeEnabled);
    googleSlidesPptxEnabledEl.checked = googleSlidesPptxEnabled === true || (googleSlidesPptxEnabled == null && legacyGoogleNativeEnabled);
    googleSheetsNativeEnabledEl.checked = googleSheetsNativeEnabled === true || (googleSheetsNativeEnabled == null && legacyGoogleNativeEnabled);
    googleSheetsExportFormatEl.value = googleSheetsExportFormat === 'csv' ? 'csv' : 'xlsx';
    customIconUrlEl.value = typeof customActionIconUrl === 'string' ? customActionIconUrl : '';
    updateGoogleSheetsExportFormatState();
    updateSetupGuideState();
  });
}

saveBtn.addEventListener('click', async () => {
  const apiKey1 = apiKey1El.value.trim();
  const apiKey2 = apiKey2El.value.trim();
  const apiKey1Label = apiKey1LabelEl.value.trim() || DEFAULT_KEY_1_LABEL;
  const apiKey2Label = apiKey2LabelEl.value.trim() || DEFAULT_KEY_2_LABEL;
  const imageExportMode = imageExportModeEl.value === 'separate' ? 'separate' : 'zip';
  const payload = {
    apiKey1,
    apiKey2,
    apiKey1Label,
    apiKey2Label,
    apiKey: apiKey1,
    imageExportMode,
    previewAutoSaveDisabled: previewAutoSaveDisabledEl.checked,
    removeDocumentHeader: removeDocumentHeaderEl.checked,
    removeDocumentFooter: removeDocumentFooterEl.checked,
    googleDocsDocxEnabled: googleDocsDocxEnabledEl.checked,
    googleSlidesPptxEnabled: googleSlidesPptxEnabledEl.checked,
    googleSheetsNativeEnabled: googleSheetsNativeEnabledEl.checked,
    googleSheetsExportFormat: googleSheetsExportFormatEl.value === 'csv' ? 'csv' : 'xlsx'
  };
  const { activeApiKeySlot } = await chrome.storage.local.get(['activeApiKeySlot']);
  if (activeApiKeySlot === 'key2' && !apiKey2) {
    payload.activeApiKeySlot = 'key1';
  }
  await chrome.storage.local.set(payload);
  updateSetupGuideState();
  setMsg(apiKey1 || apiKey2 ? tr('saved') : tr('preferences_saved'));
});

function bindVisibilityToggle(button, input) {
  button.addEventListener('click', () => {
    const nextType = input.type === 'password' ? 'text' : 'password';
    input.type = nextType;
    button.textContent = nextType === 'password' ? tr('show') : tr('hide');
  });
}

function bindHelpToggles() {
  helpToggleButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const panel = document.getElementById(button.dataset.helpToggle);
      if (!panel) return;
      const isHidden = panel.classList.toggle('hidden');
      button.setAttribute('aria-expanded', String(!isHidden));
    });
  });
}

bindVisibilityToggle(toggleVisibility1Btn, apiKey1El);
bindVisibilityToggle(toggleVisibility2Btn, apiKey2El);
googleSheetsNativeEnabledEl.addEventListener('change', updateGoogleSheetsExportFormatState);
apiKey1El.addEventListener('input', updateSetupGuideState);
apiKey2El.addEventListener('input', updateSetupGuideState);
applyCustomIconBtn.addEventListener('click', applyCustomIcon);
resetCustomIconBtn.addEventListener('click', resetCustomIcon);
bindHelpToggles();

load();
