import { msg } from './i18n.js';

export const storage = {
  get(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  },
  set(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  },
  remove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }
};

const API_KEY_1_DEFAULT_LABEL = 'API KEY 1';
const API_KEY_2_DEFAULT_LABEL = 'API KEY 2';

function normalizeApiKey(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeApiKeyLabel(value, fallback) {
  const label = typeof value === 'string' ? value.trim() : '';
  return label || fallback;
}

async function getRawApiConfig() {
  return storage.get([
    'apiKey',
    'apiKey1',
    'apiKey2',
    'apiKey1Label',
    'apiKey2Label',
    'activeApiKeySlot',
    'removeDocumentHeader',
    'removeDocumentFooter'
  ]);
}

export async function getApiConfig() {
  const raw = await getRawApiConfig();
  const key1 = normalizeApiKey(raw.apiKey1 || raw.apiKey);
  const key2 = normalizeApiKey(raw.apiKey2);
  const key1Label = normalizeApiKeyLabel(raw.apiKey1Label, API_KEY_1_DEFAULT_LABEL);
  const key2Label = normalizeApiKeyLabel(raw.apiKey2Label, API_KEY_2_DEFAULT_LABEL);
  const hasKey1 = !!key1;
  const hasKey2 = !!key2;
  const requestedSlot = raw.activeApiKeySlot === 'key2' ? 'key2' : 'key1';
  let activeApiKeySlot = 'key1';
  if (requestedSlot === 'key2' && hasKey2) {
    activeApiKeySlot = 'key2';
  } else if (!hasKey1 && hasKey2) {
    activeApiKeySlot = 'key2';
  }

  return {
    key1,
    key2,
    key1Label,
    key2Label,
    hasKey1,
    hasKey2,
    activeApiKeySlot,
    activeApiKeyLabel: activeApiKeySlot === 'key2' ? key2Label : key1Label,
    removeDocumentHeader: raw.removeDocumentHeader === true,
    removeDocumentFooter: raw.removeDocumentFooter === true
  };
}

export async function getApiKeyOrThrow() {
  const config = await getApiConfig();
  const activeApiKey = config.activeApiKeySlot === 'key2' ? config.key2 : config.key1;
  if (!activeApiKey) throw new Error(msg('error_api_key_missing'));
  return {
    apiKey: activeApiKey,
    activeApiKeySlot: config.activeApiKeySlot,
    activeApiKeyLabel: config.activeApiKeyLabel
  };
}

export async function hasApiKey() {
  const { hasKey1, hasKey2 } = await getApiConfig();
  return hasKey1 || hasKey2;
}

export async function hasSecondaryApiKey() {
  const { hasKey2 } = await getApiConfig();
  return hasKey2;
}

export async function getApiKeyOptions() {
  const config = await getApiConfig();
  const options = [];
  if (config.hasKey1) {
    options.push({ value: 'key1', label: config.key1Label });
  }
  if (config.hasKey2) {
    options.push({ value: 'key2', label: config.key2Label });
  }
  return options;
}

export async function setActiveApiKeySlot(value) {
  const next = value === 'key2' ? 'key2' : 'key1';
  const config = await getApiConfig();
  let normalized = 'key1';
  if (next === 'key2' && config.hasKey2) {
    normalized = 'key2';
  } else if (!config.hasKey1 && config.hasKey2) {
    normalized = 'key2';
  }
  await storage.set({ activeApiKeySlot: normalized });
  return normalized;
}

export async function getHeaderFooterRemovalPrefs() {
  const { removeDocumentHeader, removeDocumentFooter } = await getApiConfig();
  return {
    removeDocumentHeader,
    removeDocumentFooter
  };
}

export async function getGoogleExportPrefs() {
  const {
    googleDocsDocxEnabled,
    googleSlidesPptxEnabled,
    googleSheetsNativeEnabled,
    googleNativeExportsEnabled,
    googleSheetsExportFormat
  } = await storage.get([
    'googleDocsDocxEnabled',
    'googleSlidesPptxEnabled',
    'googleSheetsNativeEnabled',
    'googleNativeExportsEnabled',
    'googleSheetsExportFormat'
  ]);
  const legacyGoogleNativeEnabled = googleNativeExportsEnabled === true;
  return {
    googleDocsDocxEnabled: googleDocsDocxEnabled === true || (googleDocsDocxEnabled == null && legacyGoogleNativeEnabled),
    googleSlidesPptxEnabled: googleSlidesPptxEnabled === true || (googleSlidesPptxEnabled == null && legacyGoogleNativeEnabled),
    googleSheetsNativeEnabled: googleSheetsNativeEnabled === true || (googleSheetsNativeEnabled == null && legacyGoogleNativeEnabled),
    googleSheetsExportFormat: googleSheetsExportFormat === 'csv' ? 'csv' : 'xlsx'
  };
}

export async function getIndex() {
  const { ocrIndex = {}, urlToHash = {} } = await storage.get(['ocrIndex', 'urlToHash']);
  return { ocrIndex, urlToHash };
}

export async function saveIndex(ocrIndex, urlToHash) {
  await storage.set({ ocrIndex, urlToHash });
}

export async function getIncludeImagesPref() {
  const { includeImages } = await storage.get(['includeImages']);
  return includeImages !== false;
}

export async function setIncludeImagesPref(value) {
  await storage.set({ includeImages: !!value });
}

export async function getImageExportModePref() {
  const { imageExportMode } = await storage.get(['imageExportMode']);
  return imageExportMode === 'separate' ? 'separate' : 'zip';
}

export async function setImageExportModePref(value) {
  await storage.set({ imageExportMode: value === 'separate' ? 'separate' : 'zip' });
}

export async function getPreviewAutoSaveDisabledPref() {
  const { previewAutoSaveDisabled } = await storage.get(['previewAutoSaveDisabled']);
  return previewAutoSaveDisabled === true;
}

export async function getActiveOcrJob() {
  const { activeOcrJob = null } = await storage.get(['activeOcrJob']);
  return activeOcrJob;
}

export async function setActiveOcrJob(activeOcrJob) {
  await storage.set({ activeOcrJob });
}

export async function clearActiveOcrJob() {
  await storage.remove(['activeOcrJob']);
}

export async function getLastOcrJobNotice() {
  const { lastOcrJobNotice = null } = await storage.get(['lastOcrJobNotice']);
  return lastOcrJobNotice;
}

export async function setLastOcrJobNotice(lastOcrJobNotice) {
  await storage.set({ lastOcrJobNotice });
}

export async function clearLastOcrJobNotice() {
  await storage.remove(['lastOcrJobNotice']);
}

export async function getCustomActionIconConfig() {
  const { customActionIconUrl = '', customActionIconPngs = null } = await storage.get([
    'customActionIconUrl',
    'customActionIconPngs'
  ]);
  return {
    customActionIconUrl: typeof customActionIconUrl === 'string' ? customActionIconUrl : '',
    customActionIconPngs: customActionIconPngs && typeof customActionIconPngs === 'object' ? customActionIconPngs : null
  };
}
