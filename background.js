'use strict';

const API_BASE = 'https://api.mistral.ai/v1';
const DOWNLOAD_ROOT = 'Mistral-OCR';

// ------------------ storage utils ------------------
const storage = {
  get(keys) { return new Promise((r) => chrome.storage.local.get(keys, r)); },
  set(obj)  { return new Promise((r) => chrome.storage.local.set(obj, r)); },
  remove(keys) { return new Promise((r) => chrome.storage.local.remove(keys, r)); }
};

const CHROME_PDF_VIEWER_ID = 'mhjfbmdgcfjbbpaeojofohoefgiehjai';
const lastPdfByTab = new Map(); // tabId -> { url, time, contentDisposition? }

function isChromePdfViewerUrl(u) {
  try {
    const x = new URL(u || '');
    return x.protocol === 'chrome-extension:' && x.host === CHROME_PDF_VIEWER_ID;
  } catch { return false; }
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getApiKeyOrThrow() {
  const { apiKey } = await storage.get(['apiKey']);
  if (!apiKey) throw new Error('API key no configurada. Ve a Opciones.');
  return apiKey;
}
async function getIndex() {
  const { ocrIndex = {}, urlToHash = {} } = await storage.get(['ocrIndex', 'urlToHash']);
  return { ocrIndex, urlToHash };
}
async function saveIndex(ocrIndex, urlToHash) { await storage.set({ ocrIndex, urlToHash }); }

// Preferencia: incluir imágenes (por defecto true)
async function getIncludeImagesPref() {
  const { includeImages } = await storage.get(['includeImages']);
  return includeImages !== false; // default true
}
async function setIncludeImagesPref(value) {
  await storage.set({ includeImages: !!value });
}

// Captura Content-Type y Content-Disposition del main_frame PDF (para obtener filename verdadero)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    try {
      if (details.type !== 'main_frame') return;
      const headers = details.responseHeaders || [];
      const hmap = {};
      for (const h of headers) hmap[h.name.toLowerCase()] = h.value || '';
      const ct = (hmap['content-type'] || '').toLowerCase();
      if (ct.includes('application/pdf')) {
        lastPdfByTab.set(details.tabId, {
          url: details.url,
          time: Date.now(),
          contentDisposition: hmap['content-disposition'] || ''
        });
      }
    } catch {}
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

// ------------------ Chrome API (promises) ------------------
const tabsQuery = (info) => new Promise((r) => chrome.tabs.query(info, r));
const tabsSendMessage = (tabId, msg) => new Promise((r) => chrome.tabs.sendMessage(tabId, msg, r));
const downloadsSearch = (q) => new Promise((r) => chrome.downloads.search(q, r));
function downloadsDownload(opts) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(opts, (id) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(id);
    });
  });
}

// ------------------ helpers ------------------
function ab2hex(buffer) { return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2,'0')).join(''); }
async function sha256Hex(ab) { const d = await crypto.subtle.digest('SHA-256', ab); return ab2hex(d); }

function looksLikePdfPath(path) { return (path || '').toLowerCase().endsWith('.pdf'); }
function looksLikeJpegPath(path) {
  const p = (path || '').toLowerCase();
  return p.endsWith('.jpeg') || p.endsWith('.jpg');
}
function looksLikePngPath(path) { return (path || '').toLowerCase().endsWith('.png'); }
function looksLikeWebpPath(path) { return (path || '').toLowerCase().endsWith('.webp'); }

function isGoogleDocUrl(url) {
  try {
    const u = new URL(url || '');
    return u.hostname === 'docs.google.com' && /^\/document\/d\/[^/]+/.test(u.pathname);
  } catch { return false; }
}
function googleDocBaseUrl(url) {
  try {
    const u = new URL(url || '');
    const m = u.pathname.match(/\/document\/d\/([^/]+)/);
    if (!m) return null;
    return `https://docs.google.com/document/d/${m[1]}`;
  } catch { return null; }
}

// NUEVO: Slides
function isGoogleSlidesUrl(url) {
  try {
    const u = new URL(url || '');
    return u.hostname === 'docs.google.com' && /^\/presentation\/d\/[^/]+/.test(u.pathname);
  } catch { return false; }
}
function googleSlidesBaseUrl(url) {
  try {
    const u = new URL(url || '');
    const m = u.pathname.match(/\/presentation\/d\/([^/]+)/);
    if (!m) return null;
    return `https://docs.google.com/presentation/d/${m[1]}`;
  } catch { return null; }
}

// NUEVO: Sheets
function isGoogleSheetsUrl(url) {
  try {
    const u = new URL(url || '');
    return u.hostname === 'docs.google.com' && /^\/spreadsheets\/d\/[^/]+/.test(u.pathname);
  } catch { return false; }
}
function googleSheetsBaseUrl(url) {
  try {
    const u = new URL(url || '');
    const m = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!m) return null;
    return `https://docs.google.com/spreadsheets/d/${m[1]}`;
  } catch { return null; }
}

function extractResourceUrlAndNameFromUrl(anyUrl) {
  try {
    const cu = new URL(anyUrl || '');
    const pathname = decodeURIComponent(cu.pathname || '').toLowerCase();
    const nameGuess = (cu.pathname.split('/').pop() || '').trim();
    let type = null;
    if (pathname.endsWith('.pdf') || pathname.includes('/viewer/secure/pdf')) {
      type = 'pdf';
    } else if (pathname.endsWith('.jpeg') || pathname.endsWith('.jpg') || pathname.endsWith('.png') || pathname.endsWith('.webp')) {
      type = 'image';
    }
    const nameDefault = type === 'pdf' ? 'document.pdf' : (type === 'image' ? 'image' : 'document');
    return { resourceUrl: cu.href, resourceName: nameGuess || nameDefault, type };
  } catch {
    return { resourceUrl: anyUrl || '', resourceName: 'document', type: null };
  }
}

function extractPrimaryUrlFromTabUrl(tabUrl) {
  try {
    const u = new URL(tabUrl || '');
    const candidate = u.searchParams.get('src') || tabUrl;
    return candidate;
  } catch {
    return tabUrl || '';
  }
}

async function fetchAsArrayBuffer(url) {
  // 1) intenta sin credenciales (ideal para URLs firmadas googleusercontent)
  try {
    const r = await fetch(url, { credentials: 'omit', redirect: 'follow' });
    if (r.ok) {
      const ab = await r.arrayBuffer();
      return {
        ab,
        contentType: r.headers.get('content-type') || '',
        contentDisposition: r.headers.get('content-disposition') || ''
      };
    }
  } catch {}
  // 2) fallback con credenciales
  const resp = await fetch(url, { credentials: 'include', redirect: 'follow' });
  if (!resp.ok) throw new Error(`No se pudo descargar el recurso. HTTP ${resp.status}`);
  const ab = await resp.arrayBuffer();
  return {
    ab,
    contentType: resp.headers.get('content-type') || '',
    contentDisposition: resp.headers.get('content-disposition') || ''
  };
}

function mimeFromExt(ext) {
  const e = (ext || '').toLowerCase();
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'md') return 'text/markdown';
  if (e === 'json') return 'application/json';
  if (e === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}
function guessImageMime(url, contentType) {
  if (contentType && contentType.startsWith('image/')) return contentType.split(';')[0];
  try {
    const u = new URL(url);
    const ext = (u.pathname.split('.').pop() || '').toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
  } catch {}
  return 'image/jpeg';
}
function arrayBufferToBase64(ab) {
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, sub);
  }
  return btoa(binary);
}
function base64ToDataUrl(base64OrDataUrl, fallbackName = 'image.jpeg') {
  if (base64OrDataUrl.startsWith('data:')) return base64OrDataUrl;
  const ext = fallbackName.split('.').pop() || 'jpeg';
  const mime = mimeFromExt(ext);
  return `data:${mime};base64,${base64OrDataUrl}`;
}
function dataUrlFromText(text, type = 'text/plain') {
  return `data:${type};charset=utf-8,${encodeURIComponent(text)}`;
}
async function downloadFileFromUrl(url, filename, conflictAction = 'overwrite') {
  return downloadsDownload({ url, filename, saveAs: false, conflictAction });
}
function extractMarkdownImageNames(markdown) {
  const out = [];
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(markdown)) !== null) out.push(m[1]);
  return out;
}
function pickImageFileName(i, page, namesFromMd, imageObj) {
  const fromMd = namesFromMd[i];
  if (fromMd) return fromMd;
  if (imageObj && imageObj.id) return imageObj.id;
  return `img-${page.index}-${i}.jpeg`;
}
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
async function ensureDownloadIdsPresentOrSearch(entry) {
  if (!entry?.files?.md?.downloadId && entry?.files?.md?.path) {
    const found = await downloadsSearch({ filenameRegex: `${escapeRegex(entry.files.md.path)}$` });
    if (found && found.length > 0) entry.files.md.downloadId = found[0].id;
  }
  return entry;
}

// -------------- Nombre/Title helpers --------------
function unescapePdfLiteral(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '\\') {
      const n = str[++i];
      if (!n) break;
      if (n === 'n') out += '\n';
      else if (n === 'r') out += '\r';
      else if (n === 't') out += '\t';
      else if (n === 'b') out += '\b';
      else if (n === 'f') out += '\f';
      else if (n === '(') out += '(';
      else if (n === ')') out += ')';
      else if (n === '\\') out += '\\';
      else if (/[0-7]/.test(n)) {
        let oct = n;
        for (let k = 0; k < 2 && i + 1 < str.length && /[0-7]/.test(str[i + 1]); k++) {
          oct += str[++i];
        }
        out += String.fromCharCode(parseInt(oct, 8));
      } else {
        out += n;
      }
    } else {
      out += c;
    }
  }
  return out;
}
function decodeHexStringToText(hex) {
  const clean = (hex || '').replace(/[\s<>]/g, '');
  const len = clean.length;
  if (len < 2) return '';
  const bytes = new Uint8Array(Math.floor(len / 2));
  for (let i = 0; i + 1 < len; i += 2) bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  try { return new TextDecoder('utf-8').decode(bytes); } catch { return new TextDecoder('latin1').decode(bytes); }
}
function normalizeTitleCandidate(t) {
  const tt = (t || '').replace(/[\u0000-\u001F]+/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 200);
  if (!tt) return null;
  const low = tt.toLowerCase();
  if (low === 'untitled' || low === 'document' || low === 'unknown') return null;
  return tt;
}
function extractPdfTitle(ab) {
  try {
    const u8 = new Uint8Array(ab);
    // 1) XMP dc:title
    try {
      const sUtf8 = new TextDecoder('utf-8').decode(u8);
      const m = sUtf8.match(/<dc:title[\s\S]*?<rdf:Alt[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
      if (m) {
        const t = normalizeTitleCandidate(m[1]);
        if (t) return t;
      }
    } catch {}
    // 2) Info dict /Title (literal)
    try {
      const sLatin = new TextDecoder('latin1').decode(u8);
      let m = sLatin.match(/\/Title\s*\(([\s\S]*?)\)/);
      if (m) {
        const t = normalizeTitleCandidate(unescapePdfLiteral(m[1]));
        if (t) return t;
      }
      // 3) Info dict /Title <hex>
      m = sLatin.match(/\/Title\s*<([\s0-9A-Fa-f]+)>/);
      if (m) {
        const t = normalizeTitleCandidate(decodeHexStringToText(m[1]));
        if (t) return t;
      }
    } catch {}
  } catch {}
  return null;
}
function parseContentDispositionFilename(cd) {
  if (!cd) return null;
  try {
    let m = cd.match(/filename\*\s*=\s*([^;]+)/i);
    if (m) {
      let v = (m[1] || '').trim().replace(/^"|"$/g, '');
      const m2 = v.match(/^([^']*)'[^']*'(.*)$/);
      if (m2) {
        try { v = decodeURIComponent(m2[2] || ''); } catch { v = m2[2] || ''; }
      } else if (/^utf-8''/i.test(v)) {
        try { v = decodeURIComponent(v.slice(7)); } catch { v = v.slice(7); }
      }
      return v.trim();
    }
    m = cd.match(/filename\s*=\s*("([^"]+)"|([^;]+))/i);
    if (m) return (m[2] || m[3] || '').trim();
  } catch {}
  return null;
}
function filenameFromUrlHeuristics(url) {
  try {
    const u = new URL(url);
    const sp = u.searchParams;
    const keys = ['filename', 'file', 'name', 'title', 'download', 'attname'];
    for (const k of keys) {
      const v = sp.get(k);
      if (v) return decodeURIComponent(v);
    }
    const last = decodeURIComponent((u.pathname.split('/').pop() || '').trim());
    return last || null;
  } catch { return null; }
}

// -------------- PDF suffix probing --------------
function looksLikePdfBuffer(ab) {
  const sig = new TextDecoder('ascii').decode(new Uint8Array(ab).subarray(0, 4));
  return sig === '%PDF';
}
async function probePdfByAppendingSuffix(baseUrl) {
  try {
    if (!baseUrl) return null;
    const u = new URL(baseUrl);
    if (u.pathname.toLowerCase().endsWith('.pdf')) return null;
    const probeUrl = new URL(baseUrl);
    probeUrl.pathname = probeUrl.pathname + '.pdf';
    const resp = await fetch(probeUrl.href, { credentials: 'include' });
    if (!resp.ok) return null;
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/pdf')) return probeUrl.href;
    const ab = await resp.arrayBuffer();
    if (looksLikePdfBuffer(ab)) return probeUrl.href;
  } catch {}
  return null;
}

// -------------- PNG/WEBP -> JPEG client-side --------------
async function convertImageToJpegDataUrl(ab, srcMime, quality = 0.92) {
  const blob = new Blob([ab], { type: srcMime || 'application/octet-stream' });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  const buf = await jpegBlob.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  return `data:image/jpeg;base64,${b64}`;
}

// ------------------ Mistral API ------------------
async function uploadFileToMistralOcr(ab, fileName, apiKey) {
  const file = new File([ab], fileName, { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', 'ocr');
  const res = await fetch(`${API_BASE}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!res.ok) throw new Error(`Error subiendo archivo a Mistral: ${res.status} ${await res.text().catch(()=> '')}`);
  return res.json(); // { id, ... }
}
async function runMistralOcrFile(fileId, apiKey, includeImages) {
  const body = { document: { file_id: fileId }, model: 'mistral-ocr-latest', include_image_base64: !!includeImages };
  const res = await fetch(`${API_BASE}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Error en OCR: ${res.status} ${await res.text().catch(()=> '')}`);
  return res.json();
}
async function runMistralOcrImage(imageDataUrl, apiKey, includeImages) {
  const body = { document: { type: 'image_url', image_url: imageDataUrl }, model: 'mistral-ocr-latest', include_image_base64: !!includeImages };
  const res = await fetch(`${API_BASE}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Error en OCR (imagen): ${res.status} ${await res.text().catch(()=> '')}`);
  return res.json();
}

// ------------------ Artefactos ------------------
async function buildAndSaveOcrArtifacts({ ocr, hash, includeImages }) {
  let markdown = '';
  const imagesToSave = [];

  for (const page of ocr.pages || []) {
    const md = page.markdown || '';
    markdown += md + '\n\n';

    if (includeImages) {
      const namesFromMd = extractMarkdownImageNames(md);
      const imgs = page.images || [];
      for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i];
        const name = pickImageFileName(i, page, namesFromMd, im);
        const base64 = im.image_base64 || im.imageBase64;
        if (!base64) continue;
        imagesToSave.push({ name, base64 });
      }
    }
  }

  const mdUrl = dataUrlFromText(markdown, 'text/markdown');
  const mdId = await downloadFileFromUrl(mdUrl, `${DOWNLOAD_ROOT}/${hash}/transcription.md`, 'overwrite');

  const images = [];
  if (includeImages) {
    for (const img of imagesToSave) {
      const url = base64ToDataUrl(img.base64, img.name);
      const id = await downloadFileFromUrl(url, `${DOWNLOAD_ROOT}/${hash}/${img.name}`, 'overwrite');
      images.push({ path: `${DOWNLOAD_ROOT}/${hash}/${img.name}`, downloadId: id });
    }
  }

  return {
    downloads: { md: { path: `${DOWNLOAD_ROOT}/${hash}/transcription.md`, id: mdId }, images },
    markdown,
    imagesCount: includeImages ? images.length : 0,
    pages: (ocr.pages || []).length
  };
}

// ------------------ Embedded PDF helpers ------------------
async function findEmbeddedPdfUrl(tabId) {
  try {
    const res = await tabsSendMessage(tabId, { type: 'FIND_EMBEDDED_PDF' });
    if (res && res.ok && res.url) return res.url;
  } catch {}
  return null;
}

// Google Docs export via CS
async function fetchGoogleDocPdfViaCS(tabId) {
  const res = await tabsSendMessage(tabId, { type: 'GDOCS_EXPORT_PDF' });
  if (!res || !res.ok) throw new Error(res?.error || 'No se pudo exportar el PDF desde Google Docs.');
  const ab = base64ToArrayBuffer(res.pdfB64);
  return { ab, name: res.name };
}

// Google Slides export via CS
async function fetchGoogleSlidesPdfViaCS(tabId) {
  const res = await tabsSendMessage(tabId, { type: 'GSLIDES_EXPORT_PDF' });
  if (!res || !res.ok) throw new Error(res?.error || 'No se pudo exportar el PDF desde Google Slides.');
  const ab = base64ToArrayBuffer(res.pdfB64);
  return { ab, name: res.name };
}

// Google Sheets export via CS
async function fetchGoogleSheetsPdfViaCS(tabId) {
  const res = await tabsSendMessage(tabId, { type: 'GSHEETS_EXPORT_PDF' });
  if (!res || !res.ok) throw new Error(res?.error || 'No se pudo exportar el PDF desde Google Sheets.');
  const ab = base64ToArrayBuffer(res.pdfB64);
  return { ab, name: res.name };
}

// ------------------ Resolución de recurso activo ------------------
async function resolveActiveResource() {
  const [tab] = await tabsQuery({ active: true, currentWindow: true });
  if (!tab) throw new Error('No hay pestaña activa.');

  // A) Si estamos en el visor nativo de Chrome, usar la última URL PDF real capturada para este tab
  if (isChromePdfViewerUrl(tab.url)) {
    const cached = lastPdfByTab.get(tab.id);
    if (cached?.url) {
      const info = extractResourceUrlAndNameFromUrl(cached.url);
      if (info.type === 'pdf') {
        return { url: cached.url, name: info.resourceName || 'document.pdf', type: 'pdf', tab, provided: false };
      }
      return { url: cached.url, name: 'document.pdf', type: 'pdf', tab, provided: false };
    }
  }

  // A1) Google Docs
  if (isGoogleDocUrl(tab.url)) {
    const base = googleDocBaseUrl(tab.url);
    const { ab, name } = await fetchGoogleDocPdfViaCS(tab.id);
    return { url: base || tab.url, name: name || 'document.pdf', type: 'pdf', tab, ab, provided: true };
  }

  // A2) Google Slides
  if (isGoogleSlidesUrl(tab.url)) {
    const base = googleSlidesBaseUrl(tab.url);
    const { ab, name } = await fetchGoogleSlidesPdfViaCS(tab.id);
    return { url: base || tab.url, name: name || 'document.pdf', type: 'pdf', tab, ab, provided: true };
  }

  // A3) Google Sheets
  if (isGoogleSheetsUrl(tab.url)) {
    const base = googleSheetsBaseUrl(tab.url);
    const { ab, name } = await fetchGoogleSheetsPdfViaCS(tab.id);
    return { url: base || tab.url, name: name || 'document.pdf', type: 'pdf', tab, ab, provided: true };
  }

  // B) Primario (considera visor ?src=)
  const primary = extractPrimaryUrlFromTabUrl(tab.url);
  let { resourceUrl, resourceName, type } = extractResourceUrlAndNameFromUrl(primary);

  // C) Si no es PDF por sufijo, probar .pdf al final
  if (!type) {
    const probed = await probePdfByAppendingSuffix(primary);
    if (probed) {
      const info = extractResourceUrlAndNameFromUrl(probed);
      if (info.type === 'pdf') {
        resourceUrl = info.resourceUrl;
        resourceName = info.resourceName;
        type = 'pdf';
      }
    }
  }

  // D) Si sigue sin ser OCR-eable, intentar PDF incrustado único
  if (!type) {
    const embeddedUrl = await findEmbeddedPdfUrl(tab.id);
    if (embeddedUrl) {
      const info = extractResourceUrlAndNameFromUrl(embeddedUrl);
      if (info.type === 'pdf') {
        return { url: info.resourceUrl, name: info.resourceName, type: 'pdf', tab, provided: false };
      }
    }
  }

  if (!type) return { url: null, name: null, type: null, tab };
  return { url: resourceUrl, name: resourceName, type, tab, provided: false };
}

// ------------------ Flujo principal ------------------
async function runOCRForActiveResource() {
  const apiKey = await getApiKeyOrThrow();
  const includeImages = await getIncludeImagesPref();

  const resolved = await resolveActiveResource();
  const { url, name: initialName, type, ab: preAb, provided, tab } = resolved;
  if (!url || !type) throw new Error('No se detectó un recurso OCR-eable (PDF o imagen).');

  // Obtener bytes
  let ab, contentType = '', contentDisposition = '';
  if (provided && preAb) {
    ab = preAb;
  } else {
    const fetched = await fetchAsArrayBuffer(url);
    ab = fetched.ab;
    contentType = fetched.contentType;
    contentDisposition = fetched.contentDisposition || '';
  }

  const hash = await sha256Hex(ab);

  const { ocrIndex, urlToHash } = await getIndex();
  if (ocrIndex[hash]) {
    urlToHash[url] = hash;
    await saveIndex(ocrIndex, urlToHash);
    return { status: 'exists', hash, entry: ocrIndex[hash] };
  }

  // Determinar el mejor "nombre para mostrar" en la lista
  let displayName = initialName;
  if (type === 'pdf' && !provided) {
    const title = extractPdfTitle(ab);
    const normTitle = normalizeTitleCandidate(title);
    if (normTitle) {
      displayName = normTitle; // Mostrar Título (sin extensión)
    } else {
      // Intentar filename verdadero desde Content-Disposition
      let cd = contentDisposition;
      if (!cd) {
        const cached = lastPdfByTab.get(tab?.id);
        if (cached?.contentDisposition) cd = cached.contentDisposition;
      }
      const fnameFromCd = parseContentDispositionFilename(cd);
      if (fnameFromCd) {
        displayName = fnameFromCd; // filename.ext real
      } else {
        const fnameFromUrl = filenameFromUrlHeuristics(url);
        if (fnameFromUrl) displayName = fnameFromUrl;
      }
    }
  }

  // OCR
  let ocr;
  if (type === 'pdf') {
    const upload = await uploadFileToMistralOcr(ab, initialName || 'document.pdf', apiKey);
    if (!upload?.id) throw new Error('Respuesta de upload sin id de archivo.');
    ocr = await runMistralOcrFile(upload.id, apiKey, includeImages);
  } else if (type === 'image') {
    const mime = guessImageMime(url, contentType);
    let dataUrl;
    if (mime === 'image/jpeg') {
      const b64 = arrayBufferToBase64(ab);
      dataUrl = `data:image/jpeg;base64,${b64}`;
    } else {
      dataUrl = await convertImageToJpegDataUrl(ab, mime, 0.92);
    }
    ocr = await runMistralOcrImage(dataUrl, apiKey, includeImages);
  } else {
    throw new Error('Tipo de recurso no soportado.');
  }

  const { downloads, markdown, imagesCount, pages } = await buildAndSaveOcrArtifacts({ ocr, hash, includeImages });

  const createdAt = Date.now();
  const entry = {
    hash,
    name: displayName || initialName || 'document',
    url,
    createdAt,
    updatedAt: createdAt,
    pages,
    imagesCount,
    folder: `${DOWNLOAD_ROOT}/${hash}/`,
    files: {
      md: { path: `${DOWNLOAD_ROOT}/${hash}/transcription.md`, downloadId: downloads.md.id },
      images: downloads.images.map(x => ({ path: x.path, downloadId: x.downloadId }))
    },
    mdContent: markdown
  };

  ocrIndex[hash] = entry;
  urlToHash[url] = hash;
  await saveIndex(ocrIndex, urlToHash);

  return { status: 'created', hash, entry };
}

async function listEntries() {
  const { ocrIndex } = await getIndex();
  const arr = Object.values(ocrIndex);
  arr.sort((a, b) => b.updatedAt - a.updatedAt);
  return arr.map(e => ({
    hash: e.hash,
    name: e.name,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    folder: e.folder,
    mdPath: e.files?.md?.path
  }));
}

async function checkExistingForUrl(resourceUrl) {
  const { urlToHash, ocrIndex } = await getIndex();
  const hash = urlToHash[resourceUrl];
  if (hash && ocrIndex[hash]) return { found: true, hash, entry: ocrIndex[hash] };
  return { found: false };
}

async function openFolder(hash) {
  const { ocrIndex } = await getIndex();
  let entry = ocrIndex[hash];
  if (!entry) throw new Error('Transcripción no encontrada.');

  entry = await ensureDownloadIdsPresentOrSearch(entry);
  if (entry.files?.md?.downloadId) {
    chrome.downloads.show(entry.files.md.downloadId);
    return { ok: true };
  }
  const suffix = `${escapeRegex(entry.folder)}transcription.md$`;
  const found = await downloadsSearch({ filenameRegex: suffix });
  if (found && found.length > 0) {
    chrome.downloads.show(found[0].id);
    return { ok: true };
  }
  return { ok: false, error: 'No se pudo abrir la carpeta.' };
}

async function deleteEntry(hash) {
  const { ocrIndex, urlToHash } = await getIndex();
  if (!ocrIndex[hash]) return { ok: true };
  delete ocrIndex[hash];
  for (const [u, h] of Object.entries(urlToHash)) if (h === hash) delete urlToHash[u];
  await saveIndex(ocrIndex, urlToHash);
  return { ok: true };
}

async function getMarkdown(hash) {
  const { ocrIndex } = await getIndex();
  const entry = ocrIndex[hash];
  if (!entry?.mdContent) throw new Error('No hay contenido almacenado.');
  return { ok: true, content: entry.mdContent };
}

// ---------- Auto prompt (incluye Google Docs/Slides/Sheets) ----------
async function maybeAutoPromptForTab(tab) {
  try {
    if (!tab?.url) return;

    // Google Docs
    if (isGoogleDocUrl(tab.url)) {
      try {
        const { ab } = await fetchGoogleDocPdfViaCS(tab.id);
        const hash = await sha256Hex(ab);
        const { ocrIndex } = await getIndex();
        if (ocrIndex[hash]) {
          await storage.set({ autoPrompt: { hash, tabId: tab.id, url: tab.url, at: Date.now() } });
          if (chrome.action && chrome.action.openPopup) chrome.action.openPopup(() => void chrome.runtime.lastError);
        }
      } catch {}
      return;
    }

    // Google Slides
    if (isGoogleSlidesUrl(tab.url)) {
      try {
        const { ab } = await fetchGoogleSlidesPdfViaCS(tab.id);
        const hash = await sha256Hex(ab);
        const { ocrIndex } = await getIndex();
        if (ocrIndex[hash]) {
          await storage.set({ autoPrompt: { hash, tabId: tab.id, url: tab.url, at: Date.now() } });
          if (chrome.action && chrome.action.openPopup) chrome.action.openPopup(() => void chrome.runtime.lastError);
        }
      } catch {}
      return;
    }

    // Google Sheets
    if (isGoogleSheetsUrl(tab.url)) {
      try {
        const { ab } = await fetchGoogleSheetsPdfViaCS(tab.id);
        const hash = await sha256Hex(ab);
        const { ocrIndex } = await getIndex();
        if (ocrIndex[hash]) {
          await storage.set({ autoPrompt: { hash, tabId: tab.id, url: tab.url, at: Date.now() } });
          if (chrome.action && chrome.action.openPopup) chrome.action.openPopup(() => void chrome.runtime.lastError);
        }
      } catch {}
      return;
    }

    // Comportamientos ya existentes: directo por sufijo, .pdf probe, incrustado único
    const primary = extractPrimaryUrlFromTabUrl(tab.url);
    const direct = extractResourceUrlAndNameFromUrl(primary);

    if (direct.type === 'pdf' || direct.type === 'image') {
      const byUrl = await checkExistingForUrl(direct.resourceUrl);
      if (byUrl.found) {
        await storage.set({ autoPrompt: { hash: byUrl.hash, tabId: tab.id, url: tab.url, at: Date.now() } });
        if (chrome.action && chrome.action.openPopup) chrome.action.openPopup(() => void chrome.runtime.lastError);
        return;
      }
      const { ab } = await fetchAsArrayBuffer(direct.resourceUrl);
      const hash = await sha256Hex(ab);
      const { ocrIndex } = await getIndex();
      if (ocrIndex[hash]) {
        await storage.set({ autoPrompt: { hash, tabId: tab.id, url: tab.url, at: Date.now() } });
        if (chrome.action && chrome.action.openPopup) chrome.action.openPopup(() => void chrome.runtime.lastError);
      }
      return;
    }

    const probed = await probePdfByAppendingSuffix(primary);
    if (probed) {
      const byUrl = await checkExistingForUrl(probed);
      if (byUrl.found) {
        await storage.set({ autoPrompt: { hash: byUrl.hash, tabId: tab.id, url: tab.url, at: Date.now() } });
        if (chrome.action && chrome.action.openPopup) chrome.action.openPopup(() => void chrome.runtime.lastError);
        return;
      }
      const { ab } = await fetchAsArrayBuffer(probed);
      const hash = await sha256Hex(ab);
      const { ocrIndex } = await getIndex();
      if (ocrIndex[hash]) {
        await storage.set({ autoPrompt: { hash, tabId: tab.id, url: tab.url, at: Date.now() } });
        if (chrome.action && chrome.action.openPopup) chrome.action.openPopup(() => void chrome.runtime.lastError);
        return;
      }
    }

    const embedded = await findEmbeddedPdfUrl(tab.id);
    if (embedded) {
      const byUrl = await checkExistingForUrl(embedded);
      if (byUrl.found) {
        await storage.set({ autoPrompt: { hash: byUrl.hash, tabId: tab.id, url: tab.url, at: Date.now() } });
        if (chrome.action && chrome.action.openPopup) chrome.action.openPopup(() => void chrome.runtime.lastError);
        return;
      }
      const { ab } = await fetchAsArrayBuffer(embedded);
      const hash = await sha256Hex(ab);
      const { ocrIndex } = await getIndex();
      if (ocrIndex[hash]) {
        await storage.set({ autoPrompt: { hash, tabId: tab.id, url: tab.url, at: Date.now() } });
        if (chrome.action && chrome.action.openPopup) chrome.action.openPopup(() => void chrome.runtime.lastError);
      }
    }
  } catch {
    // silencioso
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') maybeAutoPromptForTab(tab);
});

// ------------------ Mensajería ------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'INIT') {
        const [tab] = await tabsQuery({ active: true, currentWindow: true });

        // Google Docs
        if (tab?.url && isGoogleDocUrl(tab.url)) {
          const base = googleDocBaseUrl(tab.url) || tab.url;
          const exists = await checkExistingForUrl(base);
          const list = await listEntries();
          const { apiKey, autoPrompt } = await storage.get(['apiKey', 'autoPrompt']);
          const includeImages = await getIncludeImagesPref();
          let prompt = null;
          if (autoPrompt && autoPrompt.url === tab?.url) prompt = autoPrompt;
          sendResponse({
            ok: true,
            resourceUrl: base,
            resourceName: 'document.pdf',
            isPdf: true,
            isOcrable: true,
            embeddedPdfUrl: null,
            exists,
            list,
            hasApiKey: !!apiKey,
            autoPrompt: prompt,
            includeImages
          });
          return;
        }

        // Google Slides
        if (tab?.url && isGoogleSlidesUrl(tab.url)) {
          const base = googleSlidesBaseUrl(tab.url) || tab.url;
          const exists = await checkExistingForUrl(base);
          const list = await listEntries();
          const { apiKey, autoPrompt } = await storage.get(['apiKey', 'autoPrompt']);
          const includeImages = await getIncludeImagesPref();
          let prompt = null;
          if (autoPrompt && autoPrompt.url === tab?.url) prompt = autoPrompt;
          sendResponse({
            ok: true,
            resourceUrl: base,
            resourceName: 'document.pdf',
            isPdf: true,
            isOcrable: true,
            embeddedPdfUrl: null,
            exists,
            list,
            hasApiKey: !!apiKey,
            autoPrompt: prompt,
            includeImages
          });
          return;
        }

        // Google Sheets
        if (tab?.url && isGoogleSheetsUrl(tab.url)) {
          const base = googleSheetsBaseUrl(tab.url) || tab.url;
          const exists = await checkExistingForUrl(base);
          const list = await listEntries();
          const { apiKey, autoPrompt } = await storage.get(['apiKey', 'autoPrompt']);
          const includeImages = await getIncludeImagesPref();
          let prompt = null;
          if (autoPrompt && autoPrompt.url === tab?.url) prompt = autoPrompt;
          sendResponse({
            ok: true,
            resourceUrl: base,
            resourceName: 'document.pdf',
            isPdf: true,
            isOcrable: true,
            embeddedPdfUrl: null,
            exists,
            list,
            hasApiKey: !!apiKey,
            autoPrompt: prompt,
            includeImages
          });
          return;
        }

        // Resto de casos (previos)
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
        let isOcrable = isPdf || isImage;

        let embeddedPdfUrl = null;
        if (!isOcrable && tab?.id) {
          embeddedPdfUrl = await findEmbeddedPdfUrl(tab.id);
          if (embeddedPdfUrl) {
            const info = extractResourceUrlAndNameFromUrl(embeddedPdfUrl);
            if (info.type === 'pdf') {
              resourceUrl = info.resourceUrl;
              resourceName = info.resourceName;
              isPdf = true;
              isImage = false;
              isOcrable = true;
            } else {
              embeddedPdfUrl = null;
            }
          }
        }

        const exists = (isOcrable && resourceUrl) ? await checkExistingForUrl(resourceUrl) : { found: false };
        const list = await listEntries();
        const { apiKey, autoPrompt } = await storage.get(['apiKey', 'autoPrompt']);
        const includeImages = await getIncludeImagesPref();
        let prompt = null;
        if (autoPrompt && autoPrompt.url === tab?.url) prompt = autoPrompt;
        sendResponse({
          ok: true,
          resourceUrl,
          resourceName,
          isPdf,
          isImage,
          isOcrable,
          embeddedPdfUrl: embeddedPdfUrl || null,
          exists,
          list,
          hasApiKey: !!apiKey,
          autoPrompt: prompt,
          includeImages
        });
      } else if (msg.type === 'RUN_OCR_FOR_ACTIVE') {
        const res = await runOCRForActiveResource();
        sendResponse({ ok: true, result: res });
      } else if (msg.type === 'OPEN_FOLDER') {
        const res = await openFolder(msg.hash);
        sendResponse(res);
      } else if (msg.type === 'LIST') {
        const list = await listEntries();
        sendResponse({ ok: true, list });
      } else if (msg.type === 'DELETE_ENTRY') {
        const res = await deleteEntry(msg.hash);
        sendResponse(res);
      } else if (msg.type === 'GET_MD') {
        const res = await getMarkdown(msg.hash);
        sendResponse(res);
      } else if (msg.type === 'SET_INCLUDE_IMAGES') {
        await setIncludeImagesPref(!!msg.value);
        sendResponse({ ok: true });
      } else if (msg.type === 'CLEAR_AUTOPROMPT') {
        await storage.remove(['autoPrompt']);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'Mensaje no soportado.' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});