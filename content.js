'use strict';

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
  try {
    const m = location.pathname.match(/\/document\/d\/([^/]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// NUEVO: Devuelve el ID de Google Slides
function getGoogleSlidesId() {
  try {
    const m = location.pathname.match(/\/presentation\/d\/([^/]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// NUEVO: Devuelve el ID de Google Sheets
function getGoogleSheetsId() {
  0
  try {
    const m = location.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Utils para base64 (para enviar el PDF al SW sin problemas de structured clone)
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

// Exporta el Google Doc actual como PDF con una estrategia robusta:
// 1) fetch directo (follow)
// 2) seguir Location si existe
// 3) fallback con iframe y luego fetch a iframe.src (URL firmada)
async function exportGoogleDocPdfRobust() {
  const docId = getGoogleDocId();
  if (!docId) return { ok: false, error: 'No es una página de Google Docs válida.' };

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=pdf`;

  // nombre sugerido a partir del título
  let name = (document.title || 'document').trim();
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';

  // 1) Intento directo
  try {
    let resp = await fetch(exportUrl, { redirect: 'follow' });
    if (resp.ok) {
      const ab = await resp.arrayBuffer();
      return { ok: true, pdfB64: arrayBufferToBase64(ab), name };
    }
    const loc = resp.headers.get('location');
    if (loc) {
      const resp2 = await fetch(loc, { redirect: 'follow' });
      if (resp2.ok) {
        const ab2 = await resp2.arrayBuffer();
        return { ok: true, pdfB64: arrayBufferToBase64(ab2), name };
      }
    }
  } catch (e1) {
    // seguir al fallback
  }

  // 3) Fallback con iframe
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = exportUrl;
    document.documentElement.appendChild(iframe);

    const awaitLoad = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timeout cargando iframe')), 15000);
      iframe.onload = () => { clearTimeout(t); resolve(); };
      iframe.onerror = () => { clearTimeout(t); reject(new Error('Error cargando iframe')); };
    });

    await awaitLoad;

    const finalUrl = iframe.src;
    iframe.remove();

    const resp3 = await fetch(finalUrl, { redirect: 'follow' });
    if (!resp3.ok) throw new Error(`HTTP ${resp3.status}`);
    const ab3 = await resp3.arrayBuffer();
    return { ok: true, pdfB64: arrayBufferToBase64(ab3), name };
  } catch (e2) {
    return { ok: false, error: e2?.message || String(e2) };
  }
}

// NUEVO: Exportar Google Slides a PDF (robusto)
async function exportGoogleSlidesPdfRobust() {
  const slidId = getGoogleSlidesId();
  if (!slidId) return { ok: false, error: 'No es una página de Google Slides válida.' };

  const exportUrl = `https://docs.google.com/presentation/d/${slidId}/export/pdf`;

  let name = (document.title || 'slides').trim();
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';

  try {
    let resp = await fetch(exportUrl, { redirect: 'follow' });
    if (resp.ok) {
      const ab = await resp.arrayBuffer();
      return { ok: true, pdfB64: arrayBufferToBase64(ab), name };
    }
    const loc = resp.headers.get('location');
    if (loc) {
      const resp2 = await fetch(loc, { redirect: 'follow' });
      if (resp2.ok) {
        const ab2 = await resp2.arrayBuffer();
        return { ok: true, pdfB64: arrayBufferToBase64(ab2), name };
      }
    }
  } catch {}

  // Fallback con iframe
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = exportUrl;
    document.documentElement.appendChild(iframe);

    const awaitLoad = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timeout cargando iframe')), 15000);
      iframe.onload = () => { clearTimeout(t); resolve(); };
      iframe.onerror = () => { clearTimeout(t); reject(new Error('Error cargando iframe')); };
    });

    await awaitLoad;

    const finalUrl = iframe.src;
    iframe.remove();

    const resp3 = await fetch(finalUrl, { redirect: 'follow' });
    if (!resp3.ok) throw new Error(`HTTP ${resp3.status}`);
    const ab3 = await resp3.arrayBuffer();
    return { ok: true, pdfB64: arrayBufferToBase64(ab3), name };
  } catch (e2) {
    return { ok: false, error: e2?.message || String(e2) };
  }
}

// NUEVO: Exportar Google Sheets a PDF (robusto)
async function exportGoogleSheetsPdfRobust() {
  const shId = getGoogleSheetsId();
  if (!shId) return { ok: false, error: 'No es una página de Google Sheets válida.' };

  // Nota: puedes ajustar parámetros extra de export según necesidad.
  const exportUrl = `https://docs.google.com/spreadsheets/d/${shId}/export?format=pdf`;

  let name = (document.title || 'sheet').trim();
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';

  try {
    let resp = await fetch(exportUrl, { redirect: 'follow' });
    if (resp.ok) {
      const ab = await resp.arrayBuffer();
      return { ok: true, pdfB64: arrayBufferToBase64(ab), name };
    }
    const loc = resp.headers.get('location');
    if (loc) {
      const resp2 = await fetch(loc, { redirect: 'follow' });
      if (resp2.ok) {
        const ab2 = await resp2.arrayBuffer();
        return { ok: true, pdfB64: arrayBufferToBase64(ab2), name };
      }
    }
  } catch {}

  // Fallback con iframe
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = exportUrl;
    document.documentElement.appendChild(iframe);

    const awaitLoad = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timeout cargando iframe')), 15000);
      iframe.onload = () => { clearTimeout(t); resolve(); };
      iframe.onerror = () => { clearTimeout(t); reject(new Error('Error cargando iframe')); };
    });

    await awaitLoad;

    const finalUrl = iframe.src;
    iframe.remove();

    const resp3 = await fetch(finalUrl, { redirect: 'follow' });
    if (!resp3.ok) throw new Error(`HTTP ${resp3.status}`);
    const ab3 = await resp3.arrayBuffer();
    return { ok: true, pdfB64: arrayBufferToBase64(ab3), name };
  } catch (e2) {
    return { ok: false, error: e2?.message || String(e2) };
  }
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
        const res = await exportGoogleDocPdfRobust();
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  // NUEVO: Exportar PDF oficial de Google Slides
  if (msg && msg.type === 'GSLIDES_EXPORT_PDF') {
    (async () => {
      try {
        const res = await exportGoogleSlidesPdfRobust();
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  // NUEVO: Exportar PDF oficial de Google Sheets
  if (msg && msg.type === 'GSHEETS_EXPORT_PDF') {
    (async () => {
      try {
        const res = await exportGoogleSheetsPdfRobust();
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  return false;
});