'use strict';

import {
  buildAndSaveOcrArtifacts,
  checkExistingForUrls,
  deleteEntry,
  deleteOcrArtifact,
  exportImages,
  exportMarkdown,
  getMarkdown,
  getPreviewData,
  listDetailedEntries,
  listEntries,
  updateConfidenceDecision,
  updateConfidenceDecisions,
  updateMarkdown
} from './bg/ocr-repository.js';
import {
  applyStoredCustomActionIcon,
  resetCustomActionIcon,
  saveAndApplyCustomActionIcon
} from './bg/icon-manager.js';
import {
  closeOffscreenDocument,
  downloadsDownload,
  ensureOffscreenDocument,
  hasOffscreenDocument,
  lastPdfByTab,
  notificationsCreate,
  registerPdfHeaderObserver,
  runtimeSendMessage,
  tabsGet,
  tabsQuery
} from './bg/chrome-api.js';
import { buildInitResourceState, fetchAsArrayBuffer, resolveResourceForTab } from './bg/resource-resolver.js';
import {
  clearActiveOcrJob,
  clearLastOcrJobNotice,
  getActiveOcrJob,
  getApiConfig,
  getApiKeyOptions,
  getApiKeyOrThrow,
  getGoogleExportPrefs,
  getHeaderFooterRemovalPrefs,
  getIncludeImagesPref,
  getIndex,
  getLastOcrJobNotice,
  getPreviewAutoSaveDisabledPref,
  hasApiKey,
  hasSecondaryApiKey,
  saveIndex,
  setActiveApiKeySlot,
  setActiveOcrJob,
  setIncludeImagesPref,
  setLastOcrJobNotice
} from './bg/storage.js';
import { msg as trMsg } from './bg/i18n.js';
import { arrayBufferToBase64, extractPdfTitle, filenameFromUrlHeuristics, normalizeTitleCandidate, parseContentDispositionFilename, sha256Hex } from './bg/utils.js';

registerPdfHeaderObserver();
void applyStoredCustomActionIcon().catch(() => {});

let activePreparationController = null;
let activeJobSourceTabId = null;
let activeJobPhase = 'idle';

function buildEntry({ hash, url, displayName, initialName, resourceKind, imagesCount, pages }) {
  const createdAt = Date.now();
  return {
    hash,
    name: displayName || initialName || 'document',
    url,
    createdAt,
    updatedAt: createdAt,
    pages,
    imagesCount,
    resourceKind: resourceKind || null
  };
}

function buildUpdatedEntry(previousEntry, { hash, url, displayName, initialName, resourceKind, imagesCount, pages }) {
  const now = Date.now();
  return {
    hash,
    name: displayName || initialName || previousEntry?.name || 'document',
    url,
    createdAt: previousEntry?.createdAt || now,
    updatedAt: now,
    pages,
    imagesCount,
    resourceKind: resourceKind || previousEntry?.resourceKind || null
  };
}

function cleanupReplacedEntry({ replacedHash, keptHash, ocrIndex, urlToHash }) {
  if (!replacedHash || replacedHash === keptHash) return false;
  const stillReferenced = Object.values(urlToHash).some((value) => value === replacedHash);
  if (!stillReferenced) {
    delete ocrIndex[replacedHash];
    return true;
  }
  return false;
}

function derivePdfDisplayName({ url, initialName, provided, ab, contentDisposition, tabId }) {
  if (provided) return initialName;

  const title = normalizeTitleCandidate(extractPdfTitle(ab));
  if (title) return title;

  let currentContentDisposition = contentDisposition;
  if (!currentContentDisposition) {
    const cached = lastPdfByTab.get(tabId);
    if (cached?.contentDisposition) currentContentDisposition = cached.contentDisposition;
  }

  return (
    parseContentDispositionFilename(currentContentDisposition) ||
    filenameFromUrlHeuristics(url) ||
    initialName
  );
}

function deriveFileDisplayName({ url, initialName, provided, contentDisposition }) {
  if (provided) return initialName;
  return (
    parseContentDispositionFilename(contentDisposition) ||
    filenameFromUrlHeuristics(url) ||
    initialName
  );
}

function buildJobId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /abort|cancel/i.test(error?.message || '');
}

async function showNotification(title, message) {
  try {
    await notificationsCreate('', {
      type: 'basic',
      iconUrl: 'icon128.png',
      title,
      message
    });
  } catch {}
}

function equivalentResourceUrls(resourceState) {
  return Array.from(new Set([
    resourceState?.resourceUrl,
    ...((resourceState?.googleExportOptions || []).map((option) => option.resourceUrl))
  ].filter(Boolean)));
}

function localizeMaybe(keyOrMessage, fallbackKey) {
  if (!keyOrMessage) return trMsg(fallbackKey);
  const localized = trMsg(keyOrMessage);
  return localized === keyOrMessage && !/^[a-z0-9_]+$/i.test(keyOrMessage)
    ? keyOrMessage
    : localized;
}

async function consumeLastOcrJobNotice() {
  const notice = await getLastOcrJobNotice();
  if (notice) await clearLastOcrJobNotice();
  return notice;
}

async function rememberOcrJobNotice({ level, title, message, job }) {
  await setLastOcrJobNotice({
    level,
    title,
    message,
    jobId: job?.id || null,
    displayName: job?.displayName || job?.resourceLabel || null,
    createdAt: Date.now()
  });
}

async function updateActiveJob(patch) {
  const current = await getActiveOcrJob();
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now()
  };
  await setActiveOcrJob(next);
  return next;
}

async function clearActiveRuntimeState() {
  activePreparationController = null;
  activeJobSourceTabId = null;
  activeJobPhase = 'idle';
  await closeOffscreenDocument().catch(() => {});
}

async function finalizeAndClearJob() {
  await clearActiveOcrJob();
  await clearActiveRuntimeState();
}

async function markStaleJobIfNeeded() {
  const current = await getActiveOcrJob();
  if (!current) {
    if (await hasOffscreenDocument()) {
      await closeOffscreenDocument().catch(() => {});
    }
    return;
  }
  if (current.status !== 'starting' && current.status !== 'running') return;
  if (await hasOffscreenDocument()) {
    activeJobSourceTabId = current.sourceTabId || null;
    activeJobPhase = 'running';
    return;
  }
  await clearActiveOcrJob();
}

async function handleCancelOutcome(reason, notify = true) {
  const current = await getActiveOcrJob();
  await rememberOcrJobNotice({
    level: 'warning',
    title: trMsg('notification_ocr_canceled_title'),
    message: reason || trMsg('ocr_canceled_background'),
    job: current
  });
  if (notify) {
    await showNotification(trMsg('notification_ocr_canceled_title'), reason || trMsg('ocr_canceled_background'));
  }
  await finalizeAndClearJob();
}

async function cancelActiveOcrJob(reason = trMsg('canceled_by_user'), notify = false) {
  const current = await getActiveOcrJob();
  if (!current) return { ok: true };

  await updateActiveJob({
    status: 'running',
    step: trMsg('step_canceling'),
    message: reason,
    error: null
  });

  if (activeJobPhase === 'preparing' && activePreparationController) {
    activePreparationController.abort(reason);
    if (notify) await showNotification(trMsg('notification_ocr_canceled_title'), reason);
    return { ok: true };
  }

  if (activeJobPhase === 'running') {
    try {
      await runtimeSendMessage({
        target: 'offscreen',
        type: 'CANCEL_OFFSCREEN_OCR',
        jobId: current.id,
        reason
      });
    } catch {
      await handleCancelOutcome(reason, notify);
    }
  } else {
    await handleCancelOutcome(reason, notify);
  }
  return { ok: true };
}

function normalizeGoogleExportFormatOverrides(value) {
  if (!value || typeof value !== 'object') return {};
  const overrides = {};
  if (value['google-doc'] === 'pdf' || value['google-doc'] === 'docx') overrides['google-doc'] = value['google-doc'];
  if (value['google-slides'] === 'pdf' || value['google-slides'] === 'pptx') overrides['google-slides'] = value['google-slides'];
  if (value['google-sheets'] === 'pdf' || value['google-sheets'] === 'xlsx' || value['google-sheets'] === 'csv') {
    overrides['google-sheets'] = value['google-sheets'];
  }
  return overrides;
}

async function prepareJobContext(forceOverwrite, googleExportFormatOverrides = {}) {
  const activeApiKey = await getApiKeyOrThrow();
  const { removeDocumentHeader, removeDocumentFooter } = await getHeaderFooterRemovalPrefs();
  const googleExportPrefs = {
    ...(await getGoogleExportPrefs()),
    googleExportFormatOverrides: normalizeGoogleExportFormatOverrides(googleExportFormatOverrides)
  };
  const includeImages = await getIncludeImagesPref();
  const [tab] = await tabsQuery({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error(trMsg('error_no_active_tab'));

  const preparationController = new AbortController();
  activePreparationController = preparationController;
  activeJobSourceTabId = tab.id;
  activeJobPhase = 'preparing';

  const job = {
    id: buildJobId(),
    status: 'starting',
    sourceTabId: tab.id,
    resourceUrl: null,
    resourceKind: null,
    resourceLabel: null,
    displayName: null,
    forceOverwrite: !!forceOverwrite,
    activeApiKeySlot: activeApiKey.activeApiKeySlot,
    activeApiKeyLabel: activeApiKey.activeApiKeyLabel,
    includeImages,
    extractHeader: removeDocumentHeader,
    extractFooter: removeDocumentFooter,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    step: trMsg('step_resolving_resource'),
    message: trMsg('preparing_resource'),
    error: null,
    resultHash: null
  };
  await setActiveOcrJob(job);

  const resolved = await resolveResourceForTab(tab, googleExportPrefs);
  const { url, name: initialName, type, ab: providedBuffer, provided } = resolved;
  if (!url || !type) throw new Error(trMsg('error_no_ocrable_resource'));

  await updateActiveJob({
    resourceUrl: url,
    resourceKind: resolved.resourceKind || type,
    resourceLabel: resolved.resourceLabel || (type === 'image' ? trMsg('resource_image') : type === 'pdf' ? 'PDF' : trMsg('resource_document')),
    message: trMsg('capturing_initial_resource')
  });

  let ab = providedBuffer;
  let contentType = '';
  let contentDisposition = '';
  if (!provided || !ab) {
    await updateActiveJob({
      step: trMsg('step_downloading_resource'),
      message: trMsg('downloading_resource_from_tab')
    });
    const fetched = await fetchAsArrayBuffer(url, preparationController.signal);
    ab = fetched.ab;
    contentType = fetched.contentType;
    contentDisposition = fetched.contentDisposition || '';
  }

  await updateActiveJob({
    step: trMsg('step_calculating_hash'),
    message: trMsg('calculating_document_identity')
  });
  const hash = await sha256Hex(ab);
  const { ocrIndex, urlToHash } = await getIndex();
  const equivalentUrls = equivalentResourceUrls({
    resourceUrl: url,
    googleExportOptions: resolved.googleExportOptions
  });
  const existingForEquivalentUrl = await checkExistingForUrls(equivalentUrls);
  const existingForUrlHash = existingForEquivalentUrl.found ? existingForEquivalentUrl.hash : null;
  const existingForUrlEntry = existingForUrlHash ? ocrIndex[existingForUrlHash] : null;
  const existingForUrlMatchedUrl = existingForEquivalentUrl.found ? existingForEquivalentUrl.matchedUrl : null;

  if (ocrIndex[hash] && !forceOverwrite) {
    urlToHash[url] = hash;
    await saveIndex(ocrIndex, urlToHash);
    await finalizeAndClearJob();
    return {
      immediate: true,
      result: { status: 'exists', hash, entry: ocrIndex[hash] }
    };
  }

  let displayName = initialName;
  if (type === 'pdf') {
    displayName = derivePdfDisplayName({
      url,
      initialName,
      provided,
      ab,
      contentDisposition,
      tabId: tab.id
    });
  } else if (type === 'file') {
    displayName = deriveFileDisplayName({
      url,
      initialName,
      provided,
      contentDisposition
    });
  }

  await updateActiveJob({
    status: 'running',
    step: trMsg('step_running_ocr'),
    message: trMsg('ocr_background_started'),
    displayName: displayName || initialName || 'document',
    existingForUrlHash,
    existingForUrlMatchedUrl,
    resultHash: hash
  });

  return {
    immediate: false,
    payload: {
      jobId: job.id,
      apiKey: activeApiKey.apiKey,
      activeApiKeySlot: activeApiKey.activeApiKeySlot,
      includeImages,
      extractHeader: removeDocumentHeader,
      extractFooter: removeDocumentFooter,
      forceOverwrite: !!forceOverwrite,
      sourceTabId: tab.id,
      url,
      initialName,
      displayName: displayName || initialName || 'document',
      type,
      resourceKind: resolved.resourceKind || type,
      contentType,
      hash,
      existingForUrlHash,
      bytesB64: arrayBufferToBase64(ab)
    },
    existingForUrlEntry
  };
}

async function startOcrJob({ forceOverwrite = false, googleExportFormatOverrides = {} } = {}) {
  await markStaleJobIfNeeded();
  const current = await getActiveOcrJob();
  if (current && (current.status === 'starting' || current.status === 'running')) {
    throw new Error(trMsg('error_ocr_already_running'));
  }

  try {
    const prepared = await prepareJobContext(forceOverwrite, googleExportFormatOverrides);
    if (prepared.immediate) return { ok: true, immediate: true, result: prepared.result };

    await ensureOffscreenDocument();
    activeJobPhase = 'running';
    activePreparationController = null;
    const response = await runtimeSendMessage({
      target: 'offscreen',
      type: 'START_OFFSCREEN_OCR',
      payload: prepared.payload
    });
    if (!response?.ok) {
      throw new Error(response?.error || trMsg('error_could_not_start_background_ocr'));
    }

    return {
      ok: true,
      immediate: false,
      job: await getActiveOcrJob()
    };
  } catch (error) {
    const reason = isAbortError(error) ? (error?.message || trMsg('ocr_canceled')) : (error?.message || trMsg('error_could_not_start_ocr'));
    const current = await getActiveOcrJob();
    if (current) {
      await rememberOcrJobNotice({
        level: isAbortError(error) ? 'warning' : 'error',
        title: isAbortError(error) ? trMsg('notification_ocr_canceled_title') : trMsg('notification_ocr_failed_title'),
        message: reason,
        job: current
      });
    }
    await finalizeAndClearJob();
    throw new Error(reason);
  }
}

async function persistCompletedOcr({ job, ocr }) {
  const { ocrIndex, urlToHash } = await getIndex();
  const existingForUrlHash = job.existingForUrlHash || (job.resourceUrl ? urlToHash[job.resourceUrl] : null);
  const existingForUrlMatchedUrl = job.existingForUrlMatchedUrl || job.resourceUrl;
  const existingForUrlEntry = existingForUrlHash ? ocrIndex[existingForUrlHash] : null;

  const artifacts = await buildAndSaveOcrArtifacts({
    ocr,
    hash: job.resultHash,
    includeImages: job.includeImages,
    resourceKind: job.resourceKind || job.type
  });

  let entry;
  let orphanedHashToDelete = null;
  if (job.forceOverwrite && existingForUrlEntry) {
    entry = buildUpdatedEntry(existingForUrlEntry, {
      hash: job.resultHash,
      url: job.resourceUrl,
      displayName: job.displayName,
      initialName: job.displayName,
      resourceKind: job.resourceKind,
      imagesCount: artifacts.imagesCount,
      pages: artifacts.pages
    });
    if (existingForUrlMatchedUrl && existingForUrlHash && existingForUrlHash !== job.resultHash) {
      delete urlToHash[existingForUrlMatchedUrl];
    }
    ocrIndex[job.resultHash] = entry;
    urlToHash[job.resourceUrl] = job.resultHash;
    const removedOrphan = cleanupReplacedEntry({
      replacedHash: existingForUrlHash,
      keptHash: job.resultHash,
      ocrIndex,
      urlToHash
    });
    if (removedOrphan) orphanedHashToDelete = existingForUrlHash;
  } else {
    entry = buildEntry({
      hash: job.resultHash,
      url: job.resourceUrl,
      displayName: job.displayName,
      initialName: job.displayName,
      resourceKind: job.resourceKind,
      imagesCount: artifacts.imagesCount,
      pages: artifacts.pages
    });
    ocrIndex[job.resultHash] = entry;
    urlToHash[job.resourceUrl] = job.resultHash;
  }

  await saveIndex(ocrIndex, urlToHash);
  if (orphanedHashToDelete) await deleteOcrArtifact(orphanedHashToDelete);
  return entry;
}

async function handleInit() {
  await markStaleJobIfNeeded();
  const [tab] = await tabsQuery({ active: true, currentWindow: true });
  const list = await listEntries();
  const includeImages = await getIncludeImagesPref();
  const activeJob = await getActiveOcrJob();
  const apiConfig = await getApiConfig();
  const apiKeyOptions = await getApiKeyOptions();
  let resourceState = {
    resourceUrl: null,
    resourceName: null,
    resourceKind: null,
    resourceLabel: null,
    isPdf: false,
    isImage: false,
    isFile: false,
    isOcrable: false,
    embeddedPdfUrl: null
  };

  if (tab) {
    resourceState = await buildInitResourceState(tab, await getGoogleExportPrefs());
  }

  const exists = resourceState.isOcrable && resourceState.resourceUrl
    ? await checkExistingForUrls(equivalentResourceUrls(resourceState))
    : { found: false };

  return {
    ok: true,
    ...resourceState,
    exists,
    list,
    activeJob,
    hasApiKey: await hasApiKey(),
    hasSecondaryApiKey: await hasSecondaryApiKey(),
    activeApiKeySlot: apiConfig.activeApiKeySlot,
    apiKeyOptions,
    includeImages,
    lastOcrJobNotice: await consumeLastOcrJobNotice()
  };
}

async function handleOffscreenProgress(msg) {
  const current = await getActiveOcrJob();
  if (!current || current.id !== msg.jobId) return { ok: true };
  await updateActiveJob({
    status: 'running',
    step: msg.step ? trMsg(msg.step) : current.step,
    message: msg.message ? trMsg(msg.message) : current.message
  });
  return { ok: true };
}

async function handleOffscreenComplete(msg) {
  const current = await getActiveOcrJob();
  if (!current || current.id !== msg.jobId) return { ok: true };

  await updateActiveJob({
    step: trMsg('step_saving_result'),
    message: trMsg('persisting_transcription_images')
  });
  await persistCompletedOcr({ job: current, ocr: msg.ocr });
  await showNotification(trMsg('notification_ocr_complete_title'), trMsg('notification_ocr_complete_message', [current.displayName || trMsg('resource_document')]));
  await finalizeAndClearJob();
  return { ok: true };
}

async function handleOffscreenError(msg) {
  const current = await getActiveOcrJob();
  if (!current || current.id !== msg.jobId) return { ok: true };
  const reason = localizeMaybe(msg.error, 'error_background_ocr_failed');
  if (msg.cancelled) {
    await handleCancelOutcome(reason, false);
  } else {
    await rememberOcrJobNotice({
      level: 'error',
      title: trMsg('notification_ocr_failed_title'),
      message: reason,
      job: current
    });
    await showNotification(trMsg('notification_ocr_failed_title'), reason);
    await finalizeAndClearJob();
  }
  return { ok: true };
}

function tabsCreate(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(tab);
    });
  });
}

function tabsRemove(tabId) {
  return new Promise((resolve) => {
    if (!tabId) return resolve();
    chrome.tabs.remove(tabId, () => resolve());
  });
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };

    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      cleanup();
      resolve();
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    tabsGet(tabId)
      .then((tab) => {
        if (tab?.status === 'complete') {
          cleanup();
          resolve();
        }
      })
      .catch(() => {});

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(trMsg('error_pdf_temp_view_timeout')));
    }, timeoutMs);
  });
}

function debuggerAttach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, '1.3', () => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve();
    });
  });
}

function debuggerDetach(target) {
  return new Promise((resolve) => {
    chrome.debugger.detach(target, () => resolve());
  });
}

function debuggerSendCommand(target, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(result);
    });
  });
}

async function exportRenderedPdf({ blobUrl, filename }) {
  if (!blobUrl || typeof blobUrl !== 'string') throw new Error(trMsg('error_missing_rendered_html'));
  let tab = null;
  let attached = false;

  try {
    tab = await tabsCreate({ url: blobUrl, active: false });
    if (!tab?.id) throw new Error(trMsg('error_open_pdf_temp_view'));
    await waitForTabComplete(tab.id);

    const target = { tabId: tab.id };
    await debuggerAttach(target);
    attached = true;
    await debuggerSendCommand(target, 'Page.enable');
    const result = await debuggerSendCommand(target, 'Page.printToPDF', {
      printBackground: true,
      displayHeaderFooter: false,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.35,
      marginBottom: 0.35,
      marginLeft: 0.35,
      marginRight: 0.35,
      preferCSSPageSize: false
    });
    if (!result?.data) throw new Error(trMsg('error_chrome_no_pdf_data'));

    await downloadsDownload({
      url: `data:application/pdf;base64,${result.data}`,
      filename: filename || 'preview.pdf',
      saveAs: false,
      conflictAction: 'uniquify'
    });
    return { ok: true };
  } finally {
    if (attached && tab?.id) await debuggerDetach({ tabId: tab.id }).catch(() => {});
    if (tab?.id) await tabsRemove(tab.id).catch(() => {});
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (!activeJobSourceTabId || tabId !== activeJobSourceTabId) return;
  void cancelActiveOcrJob(trMsg('source_tab_closed'), true);
});

void markStaleJobIfNeeded();

const messageHandlers = {
  INIT: () => handleInit(),
  START_OCR_JOB: async (msg) => startOcrJob(msg),
  SET_CUSTOM_ACTION_ICON: async (msg) => {
    if (!msg?.iconUrl || !msg?.pngs || typeof msg.pngs !== 'object') {
      throw new Error('Invalid custom icon payload.');
    }
    await saveAndApplyCustomActionIcon({ iconUrl: msg.iconUrl, pngs: msg.pngs });
    return { ok: true };
  },
  RESET_CUSTOM_ACTION_ICON: async () => {
    await resetCustomActionIcon();
    return { ok: true };
  },
  CHECK_EXISTING_FOR_URL: async (msg) => ({
    ok: true,
    exists: await checkExistingForUrls(msg.urls || msg.url)
  }),
  GET_ACTIVE_OCR_JOB: async () => ({ ok: true, activeJob: await getActiveOcrJob() }),
  CANCEL_ACTIVE_OCR_JOB: async () => cancelActiveOcrJob(trMsg('canceled_by_user'), false),
  LIST: async () => ({ ok: true, list: await listEntries() }),
  LIST_DETAILED: async () => ({ ok: true, list: await listDetailedEntries() }),
  DELETE_ENTRY: async (msg) => deleteEntry(msg.hash),
  GET_MD: async (msg) => getMarkdown(msg.hash),
  GET_PREVIEW_DATA: async (msg) => {
    const data = await getPreviewData(msg.hash);
    return {
      ...data,
      previewAutoSaveDisabled: await getPreviewAutoSaveDisabledPref()
    };
  },
  SAVE_MARKDOWN: async (msg) => {
    const data = await updateMarkdown(msg.hash, msg.markdown);
    return {
      ...data,
      previewAutoSaveDisabled: await getPreviewAutoSaveDisabledPref()
    };
  },
  SET_CONFIDENCE_DECISION: async (msg) => updateConfidenceDecision(msg.hash, msg.key, msg.decision),
  SET_CONFIDENCE_DECISIONS: async (msg) => updateConfidenceDecisions(msg.hash, msg.keys),
  EXPORT_MARKDOWN: async (msg) => exportMarkdown(msg.hash),
  EXPORT_IMAGES: async (msg) => exportImages(msg.hash),
  EXPORT_RENDERED_PDF: async (msg) => exportRenderedPdf(msg),
  SET_INCLUDE_IMAGES: async (msg) => {
    await setIncludeImagesPref(!!msg.value);
    return { ok: true };
  },
  SET_ACTIVE_API_KEY_SLOT: async (msg) => ({
    ok: true,
    activeApiKeySlot: await setActiveApiKeySlot(msg.value)
  }),
  OCR_OFFSCREEN_PROGRESS: async (msg) => handleOffscreenProgress(msg),
  OCR_OFFSCREEN_COMPLETE: async (msg) => handleOffscreenComplete(msg),
  OCR_OFFSCREEN_ERROR: async (msg) => handleOffscreenError(msg)
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === 'offscreen') return false;
  (async () => {
    try {
      const handler = msg?.type ? messageHandlers[msg.type] : null;
      if (!handler) {
        sendResponse({ ok: false, error: trMsg('error_unsupported_message') });
        return;
      }
      sendResponse(await handler(msg, sender));
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();
  return true;
});

chrome.runtime.onStartup?.addListener(() => {
  void applyStoredCustomActionIcon().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  void applyStoredCustomActionIcon().catch(() => {});
});
