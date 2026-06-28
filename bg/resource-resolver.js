import {
  CHROME_PDF_VIEWER_ID,
  canMessageContentScript,
  lastPdfByTab,
  tabsQuery,
  tabsSendMessage
} from './chrome-api.js';
import { msg } from './i18n.js';
import { base64ToArrayBuffer, looksLikePdfBuffer } from './utils.js';

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'avif',
  'tif',
  'tiff',
  'gif',
  'heic',
  'heif',
  'bmp',
  'webp'
]);

const SUPPORTED_FILE_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'doc',
  'pptx',
  'ppt',
  'xlsx',
  'csv',
  'txt',
  'epub',
  'xml',
  'rtf',
  'odt',
  'bib',
  'fb2',
  'ipynb',
  'tex',
  'opml',
  'man'
]);

function extensionFromPath(pathname) {
  const last = (pathname || '').split('/').pop() || '';
  const match = last.match(/\.([A-Za-z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function labelForExtension(ext, type) {
  if (type === 'image') return ext ? msg('resource_image_ext', [ext.toUpperCase()]) : msg('resource_image');
  if (ext === 'pdf') return 'PDF';
  if (ext === 'docx' || ext === 'doc') return 'Word';
  if (ext === 'pptx' || ext === 'ppt') return 'PowerPoint';
  if (ext === 'xlsx' || ext === 'csv') return ext.toUpperCase();
  return ext ? msg('resource_document_ext', [ext.toUpperCase()]) : msg('resource_document');
}

function isChromePdfViewerUrl(url) {
  try {
    const parsed = new URL(url || '');
    return parsed.protocol === 'chrome-extension:' && parsed.host === CHROME_PDF_VIEWER_ID;
  } catch {
    return false;
  }
}

function isGoogleUrl(url, pattern) {
  try {
    const parsed = new URL(url || '');
    return parsed.hostname === 'docs.google.com' && pattern.test(parsed.pathname);
  } catch {
    return false;
  }
}

function buildGoogleBaseUrl(url, pattern, prefix) {
  try {
    const parsed = new URL(url || '');
    const match = parsed.pathname.match(pattern);
    if (!match) return null;
    return `https://docs.google.com/${prefix}/d/${match[1]}`;
  } catch {
    return null;
  }
}

export function isGoogleDocUrl(url) {
  return isGoogleUrl(url, /^\/document\/d\/[^/]+/);
}

export function isGoogleSlidesUrl(url) {
  return isGoogleUrl(url, /^\/presentation\/d\/[^/]+/);
}

export function isGoogleSheetsUrl(url) {
  return isGoogleUrl(url, /^\/spreadsheets\/d\/[^/]+/);
}

function googleDocBaseUrl(url) {
  return buildGoogleBaseUrl(url, /\/document\/d\/([^/]+)/, 'document');
}

function googleSlidesBaseUrl(url) {
  return buildGoogleBaseUrl(url, /\/presentation\/d\/([^/]+)/, 'presentation');
}

function googleSheetsBaseUrl(url) {
  return buildGoogleBaseUrl(url, /\/spreadsheets\/d\/([^/]+)/, 'spreadsheets');
}

export function extractResourceUrlAndNameFromUrl(anyUrl) {
  try {
    const parsed = new URL(anyUrl || '');
    const pathname = decodeURIComponent(parsed.pathname || '').toLowerCase();
    const nameGuess = (parsed.pathname.split('/').pop() || '').trim();
    const ext = extensionFromPath(pathname);
    let type = null;
    let resourceKind = null;
    let resourceLabel = null;
    if (pathname.endsWith('.pdf') || pathname.includes('/viewer/secure/pdf')) {
      type = 'pdf';
      resourceKind = 'pdf';
      resourceLabel = 'PDF';
    } else if (SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
      type = 'image';
      resourceKind = `image-${ext || 'unknown'}`;
      resourceLabel = labelForExtension(ext, 'image');
    } else if (SUPPORTED_FILE_EXTENSIONS.has(ext)) {
      type = 'file';
      resourceKind = ext || 'file';
      resourceLabel = labelForExtension(ext, 'file');
    }
    const resourceName = nameGuess || (type === 'pdf' ? 'document.pdf' : type === 'image' ? `image.${ext || 'jpeg'}` : 'document');
    return { resourceUrl: parsed.href, resourceName, type, resourceKind, resourceLabel };
  } catch {
    return { resourceUrl: anyUrl || '', resourceName: 'document', type: null, resourceKind: null, resourceLabel: null };
  }
}

function extractPrimaryUrlFromTabUrl(tabUrl) {
  try {
    const parsed = new URL(tabUrl || '');
    return parsed.searchParams.get('src') || tabUrl;
  } catch {
    return tabUrl || '';
  }
}

export async function fetchAsArrayBuffer(url, signal) {
  try {
    const response = await fetch(url, { credentials: 'omit', redirect: 'follow', signal });
    if (response.ok) {
      return {
        ab: await response.arrayBuffer(),
        contentType: response.headers.get('content-type') || '',
        contentDisposition: response.headers.get('content-disposition') || ''
      };
    }
  } catch {}

  const response = await fetch(url, { credentials: 'include', redirect: 'follow', signal });
  if (!response.ok) throw new Error(msg('error_download_resource_http', [String(response.status)]));
  return {
    ab: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || '',
    contentDisposition: response.headers.get('content-disposition') || ''
  };
}

async function probePdfByAppendingSuffix(baseUrl) {
  try {
    if (!baseUrl) return null;
    const parsed = new URL(baseUrl);
    if (parsed.pathname.toLowerCase().endsWith('.pdf')) return null;
    const probeUrl = new URL(baseUrl);
    probeUrl.pathname += '.pdf';
    const response = await fetch(probeUrl.href, { credentials: 'include' });
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/pdf')) return probeUrl.href;
    if (looksLikePdfBuffer(await response.arrayBuffer())) return probeUrl.href;
  } catch {}
  return null;
}

async function findEmbeddedPdfUrl(tab) {
  if (!canMessageContentScript(tab)) return null;
  try {
    const res = await tabsSendMessage(tab.id, { type: 'FIND_EMBEDDED_PDF' });
    if (res?.ok && res.url) return res.url;
  } catch {}
  return null;
}

async function fetchGooglePdfViaCS(tabId, messageType, errorMessage) {
  const res = await tabsSendMessage(tabId, { type: messageType });
  if (!res?.ok) throw new Error(res?.error || errorMessage);
  return { ab: base64ToArrayBuffer(res.pdfB64), name: res.name };
}

function normalizeGoogleSheetsExportFormat(value) {
  return value === 'csv' ? 'csv' : 'xlsx';
}

export function getGoogleExportFormat(kind, prefs = {}) {
  const override = prefs.googleExportFormatOverrides?.[kind];
  if (kind === 'google-doc') {
    if (override === 'docx' && prefs.googleDocsDocxEnabled) return 'docx';
    if (override === 'pdf') return 'pdf';
    return prefs.googleDocsDocxEnabled ? 'docx' : 'pdf';
  }
  if (kind === 'google-slides') {
    if (override === 'pptx' && prefs.googleSlidesPptxEnabled) return 'pptx';
    if (override === 'pdf') return 'pdf';
    return prefs.googleSlidesPptxEnabled ? 'pptx' : 'pdf';
  }
  if (kind === 'google-sheets') {
    if ((override === 'xlsx' || override === 'csv') && prefs.googleSheetsNativeEnabled) return override;
    if (override === 'pdf') return 'pdf';
    return prefs.googleSheetsNativeEnabled ? normalizeGoogleSheetsExportFormat(prefs.googleSheetsExportFormat) : 'pdf';
  }
  return 'pdf';
}

function buildGoogleFormatOptions(kind, prefs = {}) {
  const options = [{ value: 'pdf', label: 'PDF' }];
  if (kind === 'google-doc' && prefs.googleDocsDocxEnabled) {
    options.push({ value: 'docx', label: 'DOCX' });
  }
  if (kind === 'google-slides' && prefs.googleSlidesPptxEnabled) {
    options.push({ value: 'pptx', label: 'PPTX' });
  }
  if (kind === 'google-sheets' && prefs.googleSheetsNativeEnabled) {
    options.push({ value: 'xlsx', label: 'XLSX' }, { value: 'csv', label: 'CSV' });
  }
  return options;
}

function googleResourceName(format) {
  return format === 'pdf' ? 'document.pdf' : `document.${format}`;
}

function googleResourceType(format) {
  return format === 'pdf' ? 'pdf' : 'file';
}

function googleResourceLabel(providerLabel, format) {
  return format === 'pdf' ? `${providerLabel} PDF` : `${providerLabel} ${format.toUpperCase()}`;
}

function googleResourceUrl(baseUrl, format) {
  if (!baseUrl) return null;
  try {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set('mistralOcrFormat', format);
    return parsed.href;
  } catch {
    return `${baseUrl}?mistralOcrFormat=${encodeURIComponent(format)}`;
  }
}

async function fetchGoogleFileViaCS(tabId, kind, format, errorMessage) {
  const res = await tabsSendMessage(tabId, { type: 'GOOGLE_EXPORT_FILE', kind, format });
  if (!res?.ok) throw new Error(res?.error || errorMessage);
  const fileB64 = res.fileB64 || res.pdfB64;
  if (!fileB64) throw new Error(errorMessage);
  return { ab: base64ToArrayBuffer(fileB64), name: res.name };
}

export const GOOGLE_PROVIDERS = [
  {
    kind: 'google-doc',
    label: 'Google Doc',
    isUrl: isGoogleDocUrl,
    baseUrl: googleDocBaseUrl,
    fetchFile: (tabId, format) => fetchGoogleFileViaCS(tabId, 'doc', format, msg('error_export_file_google_docs')),
    fetchPdf: (tabId) => fetchGooglePdfViaCS(tabId, 'GDOCS_EXPORT_PDF', msg('error_export_pdf_google_docs'))
  },
  {
    kind: 'google-slides',
    label: 'Google Slides',
    isUrl: isGoogleSlidesUrl,
    baseUrl: googleSlidesBaseUrl,
    fetchFile: (tabId, format) => fetchGoogleFileViaCS(tabId, 'slides', format, msg('error_export_file_google_slides')),
    fetchPdf: (tabId) => fetchGooglePdfViaCS(tabId, 'GSLIDES_EXPORT_PDF', msg('error_export_pdf_google_slides'))
  },
  {
    kind: 'google-sheets',
    label: 'Google Sheets',
    isUrl: isGoogleSheetsUrl,
    baseUrl: googleSheetsBaseUrl,
    fetchFile: (tabId, format) => fetchGoogleFileViaCS(tabId, 'sheets', format, msg('error_export_file_google_sheets')),
    fetchPdf: (tabId) => fetchGooglePdfViaCS(tabId, 'GSHEETS_EXPORT_PDF', msg('error_export_pdf_google_sheets'))
  }
];

export function getGoogleProvider(url) {
  return GOOGLE_PROVIDERS.find((provider) => provider.isUrl(url));
}

export async function buildInitResourceState(tab, googleExportPrefs = {}) {
  const googleProvider = getGoogleProvider(tab?.url);
  if (tab?.url && googleProvider) {
    const format = getGoogleExportFormat(googleProvider.kind, googleExportPrefs);
    const baseUrl = googleProvider.baseUrl(tab.url) || tab.url;
    const type = googleResourceType(format);
    const formatOptions = buildGoogleFormatOptions(googleProvider.kind, googleExportPrefs);
    return {
      resourceUrl: googleResourceUrl(baseUrl, format) || baseUrl,
      resourceName: googleResourceName(format),
      resourceKind: googleProvider.kind,
      resourceLabel: googleResourceLabel(googleProvider.label, format),
      isPdf: type === 'pdf',
      isImage: false,
      isFile: type === 'file',
      isOcrable: true,
      embeddedPdfUrl: null,
      googleExportFormat: format,
      googleExportOptions: formatOptions.map((option) => ({
        ...option,
        resourceUrl: googleResourceUrl(baseUrl, option.value) || baseUrl,
        resourceName: googleResourceName(option.value),
        resourceLabel: googleResourceLabel(googleProvider.label, option.value),
        isPdf: googleResourceType(option.value) === 'pdf',
        isFile: googleResourceType(option.value) === 'file'
      })),
      showGoogleExportFormatSelector: formatOptions.length > 1
    };
  }

  const primary = extractPrimaryUrlFromTabUrl(tab?.url || '');
  let direct = extractResourceUrlAndNameFromUrl(primary);
  if (!direct.type) {
    const probed = await probePdfByAppendingSuffix(primary);
    if (probed) direct = extractResourceUrlAndNameFromUrl(probed);
  }

  let resourceUrl = direct.resourceUrl;
  let resourceName = direct.resourceName;
  let isPdf = direct.type === 'pdf';
  let isImage = direct.type === 'image';
  let isFile = direct.type === 'file';
  let isOcrable = isPdf || isImage || isFile;
  let embeddedPdfUrl = null;
  let resourceKind = direct.resourceKind || (isPdf ? 'pdf' : isImage ? 'image' : isFile ? 'file' : null);
  let resourceLabel = direct.resourceLabel || (isPdf ? 'PDF' : isImage ? msg('resource_image') : isFile ? msg('resource_document') : null);

  if (!isOcrable && tab?.id) {
    embeddedPdfUrl = await findEmbeddedPdfUrl(tab);
    if (embeddedPdfUrl) {
      const info = extractResourceUrlAndNameFromUrl(embeddedPdfUrl);
      if (info.type === 'pdf') {
        resourceUrl = info.resourceUrl;
        resourceName = info.resourceName;
        isPdf = true;
        isImage = false;
        isFile = false;
        isOcrable = true;
        resourceKind = 'embedded-pdf';
        resourceLabel = msg('resource_embedded_pdf');
      } else {
        embeddedPdfUrl = null;
      }
    }
  }

  return {
    resourceUrl,
    resourceName,
    resourceKind,
    resourceLabel,
    isPdf,
    isImage,
    isFile,
    isOcrable,
    embeddedPdfUrl: embeddedPdfUrl || null
  };
}

export async function resolveResourceForTab(tab, googleExportPrefs = {}) {
  if (!tab) throw new Error(msg('error_no_active_tab'));

  if (isChromePdfViewerUrl(tab.url)) {
    const cached = lastPdfByTab.get(tab.id);
    if (cached?.url) {
      const info = extractResourceUrlAndNameFromUrl(cached.url);
      return {
        url: cached.url,
        name: info.type === 'pdf' ? info.resourceName || 'document.pdf' : 'document.pdf',
        type: 'pdf',
        resourceKind: 'pdf',
        tab,
        provided: false
      };
    }
  }

  const googleProvider = getGoogleProvider(tab.url);
  if (googleProvider) {
    const base = googleProvider.baseUrl(tab.url);
    const format = getGoogleExportFormat(googleProvider.kind, googleExportPrefs);
    const type = googleResourceType(format);
    const { ab, name } = format === 'pdf'
      ? await googleProvider.fetchPdf(tab.id)
      : await googleProvider.fetchFile(tab.id, format);
    return {
      url: googleResourceUrl(base || tab.url, format) || base || tab.url,
      name: name || googleResourceName(format),
      type,
      resourceKind: googleProvider.kind,
      resourceLabel: googleResourceLabel(googleProvider.label, format),
      tab,
      ab,
      provided: true
    };
  }

  const initState = await buildInitResourceState(tab, googleExportPrefs);
  if (!initState.isOcrable) return { url: null, name: null, type: null, resourceKind: null, tab };

  return {
    url: initState.resourceUrl,
    name: initState.resourceName,
    type: initState.isImage ? 'image' : initState.isPdf ? 'pdf' : 'file',
    resourceKind: initState.resourceKind,
    resourceLabel: initState.resourceLabel,
    tab,
    provided: false
  };
}

export async function resolveActiveResource() {
  const [tab] = await tabsQuery({ active: true, currentWindow: true });
  return resolveResourceForTab(tab);
}
