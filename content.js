'use strict';

function i18n(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// Convierte un src relativo o protocol-relative ("//...") en URL absoluta
function toAbsoluteUrl(src) {
  try { return new URL(src, location.href).href; } catch { return null; }
}

// Heurística estricta para decidir si una URL apunta a un PDF real
function isPdfLikeUrl(urlStr) {
  try {
    const u = new URL(urlStr, location.href);
    const path = (u.pathname || '').toLowerCase();
    if (path.endsWith('.pdf')) return true;

    // Algunos sitios usan ?format=pdf o flags similares
    const sp = u.searchParams;
    if ((sp.get('format') || '').toLowerCase() === 'pdf') return true;

    // Heurísticas adicionales opcionales:
    // mime=application/pdf | mimeType=application/pdf | contentType=application/pdf
    const mimeParams = ['mime', 'mimeType', 'contentType'];
    for (const key of mimeParams) {
      const v = (sp.get(key) || '').toLowerCase();
      if (v === 'application/pdf' || v === 'application/x-pdf') return true;
    }

    return false;
  } catch {
    return false;
  }
}

// Devuelve true si el elemento declara explícitamente tipo PDF
function hasPdfMimeAttr(el) {
  const t = (el.getAttribute('type') || '').toLowerCase();
  return t === 'application/pdf' || t === 'application/x-pdf';
}

// Detecta un único PDF incrustado (embed/object/iframe) de forma estricta.
// Solo devuelve URL si hay exactamente UNO; con 0 o >1 devuelve null.
function findSingleEmbeddedPdfUrl() {
  try {
    const candidates = [];

    // <embed>
    document.querySelectorAll('embed').forEach(el => {
      const src = el.getAttribute('src') || '';
      if (!src) return;
      if (hasPdfMimeAttr(el) || isPdfLikeUrl(src)) {
        const abs = toAbsoluteUrl(src);
        if (abs) candidates.push(abs);
      }
    });

    // <object>
    document.querySelectorAll('object').forEach(el => {
      const data = el.getAttribute('data') || '';
      if (!data) return;
      if (hasPdfMimeAttr(el) || isPdfLikeUrl(data)) {
        const abs = toAbsoluteUrl(data);
        if (abs) candidates.push(abs);
      }
    });

    // <iframe>
    document.querySelectorAll('iframe').forEach(el => {
      const src = el.getAttribute('src') || '';
      if (!src) return;
      if (isPdfLikeUrl(src)) {
        const abs = toAbsoluteUrl(src);
        if (abs) candidates.push(abs);
      }
    });

    // Unificar duplicados exactos
    const unique = Array.from(new Set(candidates.filter(Boolean)));

    if (unique.length === 1) return unique[0];
    return null;
  } catch {
    return null;
  }
}

// Devuelve el ID del Google Doc si estamos en una URL de Docs
function getGoogleDocId() {
  return getGoogleResourceId(/\/document\/d\/([^/]+)/);
}

function getGoogleSlidesId() {
  return getGoogleResourceId(/\/presentation\/d\/([^/]+)/);
}

function getGoogleSheetsId() {
  try {
    return getGoogleResourceId(/\/spreadsheets\/d\/([^/]+)/);
  } catch {
    return null;
  }
}

function getGoogleResourceId(pattern) {
  try {
    const m = location.pathname.match(pattern);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Utils para base64 (para enviar archivos al SW sin problemas de structured clone)
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

function getSafeFileName(defaultName, extension) {
  let name = (document.title || defaultName).trim();
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
  const ext = String(extension || '').replace(/^\./, '').toLowerCase() || 'pdf';
  if (!name.toLowerCase().endsWith(`.${ext}`)) name = `${name.replace(/\.[A-Za-z0-9]{1,8}$/, '')}.${ext}`;
  return name;
}

async function fetchExportAsBase64(exportUrl, name) {
  try {
    const resp = await fetch(exportUrl, { redirect: 'follow' });
    if (resp.ok) {
      const ab = await resp.arrayBuffer();
      const fileB64 = arrayBufferToBase64(ab);
      return { ok: true, fileB64, pdfB64: fileB64, name };
    }
    const loc = resp.headers.get('location');
    if (loc) {
      const resp2 = await fetch(loc, { redirect: 'follow' });
      if (resp2.ok) {
        const ab2 = await resp2.arrayBuffer();
        const fileB64 = arrayBufferToBase64(ab2);
        return { ok: true, fileB64, pdfB64: fileB64, name };
      }
    }
  } catch {
    // seguir al fallback
  }

  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = exportUrl;
    document.documentElement.appendChild(iframe);

    const awaitLoad = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(i18n('error_iframe_timeout'))), 15000);
      iframe.onload = () => { clearTimeout(t); resolve(); };
      iframe.onerror = () => { clearTimeout(t); reject(new Error(i18n('error_iframe_loading'))); };
    });

    await awaitLoad;

    const finalUrl = iframe.src;
    iframe.remove();

    const resp3 = await fetch(finalUrl, { redirect: 'follow' });
    if (!resp3.ok) throw new Error(`HTTP ${resp3.status}`);
    const ab3 = await resp3.arrayBuffer();
    const fileB64 = arrayBufferToBase64(ab3);
    return { ok: true, fileB64, pdfB64: fileB64, name };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Exporta el Google Doc actual con una estrategia robusta:
// 1) fetch directo (follow)
// 2) seguir Location si existe
// 3) fallback con iframe y luego fetch a iframe.src (URL firmada)
async function exportGoogleDocRobust(format = 'pdf') {
  const docId = getGoogleDocId();
  if (!docId) return { ok: false, error: i18n('error_invalid_google_docs_page') };

  const normalizedFormat = format === 'docx' ? 'docx' : 'pdf';
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=${normalizedFormat}`;
  return fetchExportAsBase64(exportUrl, getSafeFileName('document', normalizedFormat));
}

async function exportGoogleSlidesRobust(format = 'pdf') {
  const slidId = getGoogleSlidesId();
  if (!slidId) return { ok: false, error: i18n('error_invalid_google_slides_page') };

  const normalizedFormat = format === 'pptx' ? 'pptx' : 'pdf';
  const exportUrl = `https://docs.google.com/presentation/d/${slidId}/export/${normalizedFormat}`;
  return fetchExportAsBase64(exportUrl, getSafeFileName('slides', normalizedFormat));
}

function getGoogleSheetsGid() {
  try {
    const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const fromHash = hash.get('gid');
    if (fromHash) return fromHash;
    const query = new URLSearchParams(location.search || '');
    return query.get('gid');
  } catch {
    return null;
  }
}

async function exportGoogleSheetsRobust(format = 'pdf') {
  const shId = getGoogleSheetsId();
  if (!shId) return { ok: false, error: i18n('error_invalid_google_sheets_page') };

  const normalizedFormat = format === 'csv' ? 'csv' : format === 'xlsx' ? 'xlsx' : 'pdf';
  const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${shId}/export`);
  exportUrl.searchParams.set('format', normalizedFormat);
  if (normalizedFormat === 'csv') {
    const gid = getGoogleSheetsGid();
    if (gid) exportUrl.searchParams.set('gid', gid);
  }
  return fetchExportAsBase64(exportUrl.href, getSafeFileName('sheet', normalizedFormat));
}

function normalizeGoogleExportFormat(kind, format) {
  if (kind === 'doc') return format === 'docx' ? 'docx' : 'pdf';
  if (kind === 'slides') return format === 'pptx' ? 'pptx' : 'pdf';
  if (kind === 'sheets') return format === 'csv' ? 'csv' : format === 'xlsx' ? 'xlsx' : 'pdf';
  return 'pdf';
}

async function exportGoogleResource(kind, format) {
  const normalizedFormat = normalizeGoogleExportFormat(kind, format);
  if (kind === 'doc') return exportGoogleDocRobust(normalizedFormat);
  if (kind === 'slides') return exportGoogleSlidesRobust(normalizedFormat);
  if (kind === 'sheets') return exportGoogleSheetsRobust(normalizedFormat);
  return { ok: false, error: i18n('error_unsupported_google_document_type') };
}

// Mensajería con el background/popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Consulta por PDF incrustado único (estricto)
  if (msg && msg.type === 'FIND_EMBEDDED_PDF') {
    try {
      const url = findSingleEmbeddedPdfUrl();
      sendResponse({ ok: !!url, url: url || null });
    } catch (e) {
      sendResponse({ ok: false, url: null, error: e?.message || String(e) });
    }
    return true;
  }

  // Exportar PDF oficial de Google Docs (robusto)
  if (msg && msg.type === 'GDOCS_EXPORT_PDF') {
    (async () => {
      try {
        const res = await exportGoogleDocRobust('pdf');
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  // Exportar PDF oficial de Google Slides
  if (msg && msg.type === 'GSLIDES_EXPORT_PDF') {
    (async () => {
      try {
        const res = await exportGoogleSlidesRobust('pdf');
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  // Exportar PDF oficial de Google Sheets
  if (msg && msg.type === 'GSHEETS_EXPORT_PDF') {
    (async () => {
      try {
        const res = await exportGoogleSheetsRobust('pdf');
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (msg && msg.type === 'GOOGLE_EXPORT_FILE') {
    (async () => {
      try {
        const res = await exportGoogleResource(msg.kind, msg.format);
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  return false;
});
