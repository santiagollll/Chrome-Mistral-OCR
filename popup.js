'use strict';

const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');
const btnRun = document.getElementById('btnRun');
const existInfo = document.getElementById('existInfo');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const openOptions = document.getElementById('openOptions');
const controlsEl = document.getElementById('controls');
const chkImages = document.getElementById('chkImages');

const promptEl = document.getElementById('prompt');
const btnPromptOpen = document.getElementById('btnPromptOpen');
const btnPromptDismiss = document.getElementById('btnPromptDismiss');

let current = {
  resourceUrl: null,
  resourceName: null,
  isPdf: false,
  isJpeg: false,
  isOcrable: false,
  embeddedPdfUrl: null,
  exists: { found: false },
  hasApiKey: false,
  autoPrompt: null,
  includeImages: true
};

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || '';
  statusEl.className = isError ? 'small warn' : 'small';
}

function renderList(items) {
  listEl.innerHTML = '';
  if (!items || items.length === 0) {
    listEl.textContent = 'No hay transcripciones previas.';
    return;
  }
  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'entry';
    const when = new Date(it.updatedAt || it.createdAt).toLocaleString();
    div.innerHTML = `
      <div><strong>${it.name}</strong></div>
      <div class="small">${it.hash}</div>
      <div class="small">Actualizado: ${when}</div>
      <div class="actions">
        <button data-act="folder" data-hash="${it.hash}">Abrir carpeta</button>
        <button data-act="copy" data-hash="${it.hash}">Copiar contenido</button>
        <button data-act="delete" data-hash="${it.hash}">Eliminar</button>
      </div>
    `;
    listEl.appendChild(div);
  }
}

function updateExistInfo() {
  if (!current.isOcrable) {
    // Si hay PDF incrustado, informar
    if (current.embeddedPdfUrl) {
      existInfo.textContent = 'Se detectó un PDF incrustado único en esta página.';
    } else {
      existInfo.textContent = '';
    }
    return;
  }
  if (!current.resourceUrl) {
    existInfo.textContent = 'No se detectó URL OCR-eable.';
    return;
  }
  if (current.exists?.found) {
    existInfo.innerHTML = `Ya existe OCR para esta URL. <button id="openFolderCurrent">Abrir carpeta</button>`;
    setTimeout(() => {
      document.getElementById('openFolderCurrent')?.addEventListener('click', () => openFolder(current.exists.hash));
    }, 0);
  } else {
    existInfo.textContent = 'No hay OCR previo para esta URL.';
  }
}

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function showPrompt(show) {
  promptEl.style.display = show ? 'block' : 'none';
}

async function init() {
  setStatus('Cargando...');
  const resp = await sendMessage({ type: 'INIT' });
  setStatus('');
  if (!resp?.ok) {
    setStatus(resp?.error || 'Error inicializando', true);
    return;
  }

  current.resourceUrl = resp.resourceUrl;
  current.resourceName = resp.resourceName;
  current.isPdf = !!resp.isPdf;
  current.isImage = !!resp.isImage; // NUEVO
  current.isOcrable = !!resp.isOcrable;
  current.embeddedPdfUrl = resp.embeddedPdfUrl || null;
  current.exists = resp.exists;
  current.hasApiKey = !!resp.hasApiKey;
  current.autoPrompt = resp.autoPrompt || null;
  current.includeImages = resp.includeImages !== false;

  apiKeyStatus.textContent = current.hasApiKey ? 'configurada' : 'no configurada';

  // Mostrar controles si hay recurso OCR-eable DIRECTO o PDF incrustado
  const canOcr = current.isOcrable || !!current.embeddedPdfUrl;
  controlsEl.classList.toggle('hidden', !canOcr);

  btnRun.disabled = !canOcr || !current.hasApiKey;

  // set checkbox
  chkImages.checked = current.includeImages;

  updateExistInfo();
  renderList(resp.list);

  btnRun.disabled = !canOcr || !current.hasApiKey;

  if ((current.isPdf || current.isJpeg) && current.autoPrompt && current.autoPrompt.hash) {
    showPrompt(true);
  }
}

async function runOcr() {
  setStatus('Procesando OCR (esto puede tardar)...');
  const resp = await sendMessage({ type: 'RUN_OCR_FOR_ACTIVE' });
  if (!resp?.ok) {
    setStatus(resp?.error || 'Error en OCR', true);
    return;
  }
  const r = resp.result;
  if (r.status === 'exists') {
    setStatus('Este recurso ya estaba procesado. Abriendo carpeta...');
    await openFolder(r.hash);
  } else {
    setStatus('OCR completado. Abriendo carpeta...');
    await openFolder(r.hash);
  }
  const refreshed = await sendMessage({ type: 'LIST' });
  if (refreshed?.ok) renderList(refreshed.list);
}

async function openFolder(hash) {
  const resp = await sendMessage({ type: 'OPEN_FOLDER', hash });
  if (!resp?.ok) setStatus(resp?.error || 'No se pudo abrir la carpeta', true);
}

async function deleteEntry(hash) {
  const resp = await sendMessage({ type: 'DELETE_ENTRY', hash });
  if (!resp?.ok) {
    setStatus(resp?.error || 'No se pudo eliminar', true);
    return;
  }
  setStatus('Eliminado de la lista.');
  const refreshed = await sendMessage({ type: 'LIST' });
  if (refreshed?.ok) renderList(refreshed.list);
}

async function copyMd(hash) {
  const resp = await sendMessage({ type: 'GET_MD', hash });
  if (!resp?.ok || !resp.content) {
    setStatus(resp?.error || 'No se pudo obtener el contenido', true);
    return;
  }
  try {
    await navigator.clipboard.writeText(resp.content);
    setStatus('Contenido copiado al portapapeles.');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = resp.content;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setStatus('Contenido copiado (fallback).');
  }
}

// Eventos UI
btnRun.addEventListener('click', runOcr);

chkImages.addEventListener('change', async () => {
  const value = !!chkImages.checked;
  await sendMessage({ type: 'SET_INCLUDE_IMAGES', value });
});

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const hash = btn.getAttribute('data-hash');
  const act = btn.getAttribute('data-act');
  if (act === 'folder') openFolder(hash);
  if (act === 'delete') deleteEntry(hash);
  if (act === 'copy') copyMd(hash);
});

openOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Prompt de auto detección
btnPromptOpen.addEventListener('click', async () => {
  if (current.autoPrompt?.hash) await openFolder(current.autoPrompt.hash);
  await sendMessage({ type: 'CLEAR_AUTOPROMPT' });
  showPrompt(false);
});
btnPromptDismiss.addEventListener('click', async () => {
  await sendMessage({ type: 'CLEAR_AUTOPROMPT' });
  showPrompt(false);
});

init();