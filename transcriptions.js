'use strict';

const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');
const searchBoxEl = document.getElementById('searchBox');
const tr = window.t || ((key) => key);
let allItems = [];

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || '';
  statusEl.className = isError ? 'small status-line warn' : 'small status-line';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: err.message });
      resolve(response);
    });
  });
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
  } catch {
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
  setStatus(resp?.ok ? tr('markdown_exported') : (resp?.error || tr('could_not_export_markdown')), !resp?.ok);
}

async function exportImages(hash) {
  const resp = await sendMessage({ type: 'EXPORT_IMAGES', hash });
  setStatus(resp?.ok ? tr('images_exported') : (resp?.error || tr('could_not_export_images')), !resp?.ok);
}

async function deleteEntry(hash) {
  const resp = await sendMessage({ type: 'DELETE_ENTRY', hash });
  if (!resp?.ok) {
    setStatus(resp?.error || tr('could_not_delete'), true);
    return;
  }
  setStatus(tr('deleted_from_list'));
  await load();
}

function renderList(items) {
  listEl.innerHTML = '';
  if (!items?.length) {
    listEl.innerHTML = `<div class="small">${escapeHtml(tr('no_saved_transcriptions'))}</div>`;
    return;
  }

  for (const item of items) {
    const createdAt = new Date(item.createdAt).toLocaleString();
    const updatedAt = new Date(item.updatedAt || item.createdAt).toLocaleString();
    const div = document.createElement('div');
    div.className = 'entry transcription-entry';
    div.innerHTML = `
      <div class="transcription-main">
        <div class="transcription-head">
          <div>
            <div class="entry-title">${escapeHtml(item.name)}</div>
            <div class="small hash-line">SHA ${escapeHtml(item.hash)}</div>
          </div>
          <div class="transcription-kind">${escapeHtml(item.resourceKind || tr('unknown'))}</div>
        </div>
        <div class="transcription-meta">
          <span>${escapeHtml(tr('pages_count', [String(item.pages ?? 0)]))}</span>
          <span>${escapeHtml(tr('images_count', [String(item.imagesCount ?? 0)]))}</span>
          <span>${escapeHtml(tr('created_at', [createdAt]))}</span>
          <span>${escapeHtml(tr('updated_at', [updatedAt]))}</span>
        </div>
        <div class="source-line">
          <span class="meta-label">${escapeHtml(tr('source'))}</span>
          <span class="url-line">${escapeHtml(item.url || tr('no_registered_url'))}</span>
        </div>
      </div>
      <div class="actions">
        <button data-act="preview" data-hash="${escapeHtml(item.hash)}">Preview/Edit</button>
        <button data-act="copy" data-hash="${escapeHtml(item.hash)}">${escapeHtml(tr('copy_content'))}</button>
        <button data-act="export-md" data-hash="${escapeHtml(item.hash)}">${escapeHtml(tr('export_markdown'))}</button>
        <button data-act="export-images" data-hash="${escapeHtml(item.hash)}">${escapeHtml(tr('export_images'))}</button>
        <button class="danger" data-act="delete" data-hash="${escapeHtml(item.hash)}">${escapeHtml(tr('delete'))}</button>
      </div>
    `;
    listEl.appendChild(div);
  }
}

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [
    item.name,
    item.url,
    item.hash,
    item.resourceKind,
    item.pages,
    item.imagesCount
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function renderFilteredList() {
  const query = (searchBoxEl.value || '').trim().toLowerCase();
  renderList(allItems.filter((item) => matchesSearch(item, query)));
}

async function load() {
  setStatus(tr('loading'));
  const resp = await sendMessage({ type: 'LIST_DETAILED' });
  if (!resp?.ok) {
    setStatus(resp?.error || tr('could_not_load_list'), true);
    return;
  }
  allItems = Array.isArray(resp.list) ? resp.list : [];
  renderFilteredList();
  setStatus('');
}

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const hash = btn.getAttribute('data-hash');
  const action = btn.getAttribute('data-act');
  if (action === 'preview') {
    window.open(`preview.html?hash=${encodeURIComponent(hash)}`, '_blank');
    return;
  }
  if (action === 'copy') copyMd(hash);
  if (action === 'export-md') exportMarkdown(hash);
  if (action === 'export-images') exportImages(hash);
  if (action === 'delete') deleteEntry(hash);
});

searchBoxEl.addEventListener('input', renderFilteredList);

load();
