import { msg } from './i18n.js';

export const CHROME_PDF_VIEWER_ID = 'mhjfbmdgcfjbbpaeojofohoefgiehjai';
export const lastPdfByTab = new Map();
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let creatingOffscreenDocument = null;

export const tabsQuery = (info) => new Promise((resolve) => chrome.tabs.query(info, resolve));
export const tabsGet = (tabId) => new Promise((resolve, reject) => {
  chrome.tabs.get(tabId, (tab) => {
    const err = chrome.runtime.lastError;
    if (err) return reject(new Error(err.message));
    resolve(tab);
  });
});

export function tabsSendMessage(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(response);
    });
  });
}

export function downloadsDownload(opts) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(opts, (id) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(id);
    });
  });
}

export function runtimeSendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(response);
    });
  });
}

export function notificationsCreate(id, options) {
  return new Promise((resolve, reject) => {
    chrome.notifications.create(id, options, (createdId) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(createdId);
    });
  });
}

export async function hasOffscreenDocument() {
  if (!('offscreen' in chrome)) return false;
  if ('getContexts' in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    return contexts.length > 0;
  }
  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url.includes(chrome.runtime.id) && client.url.endsWith(OFFSCREEN_DOCUMENT_PATH));
}

export async function ensureOffscreenDocument() {
  if (!('offscreen' in chrome)) throw new Error(msg('error_offscreen_not_supported'));
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }
  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['BLOBS'],
    justification: msg('offscreen_justification')
  });
  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

export async function closeOffscreenDocument() {
  if (!('offscreen' in chrome)) return;
  if (!(await hasOffscreenDocument())) return;
  await chrome.offscreen.closeDocument();
}

export function canMessageContentScript(tab) {
  if (!tab?.id || !tab?.url) return false;
  try {
    const protocol = new URL(tab.url).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
  } catch {
    return false;
  }
}

export function registerPdfHeaderObserver() {
  if (registerPdfHeaderObserver.registered) return;
  registerPdfHeaderObserver.registered = true;

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      try {
        if (details.type !== 'main_frame') return;
        const headers = details.responseHeaders || [];
        const headerMap = {};
        for (const header of headers) headerMap[header.name.toLowerCase()] = header.value || '';
        const contentType = (headerMap['content-type'] || '').toLowerCase();
        if (!contentType.includes('application/pdf')) return;
        lastPdfByTab.set(details.tabId, {
          url: details.url,
          time: Date.now(),
          contentDisposition: headerMap['content-disposition'] || ''
        });
      } catch {}
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders', 'extraHeaders']
  );
}

registerPdfHeaderObserver.registered = false;
