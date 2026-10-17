'use strict';

const statusEl = document.getElementById('status');
const statusMessageEl = document.getElementById('statusMessage');
const statusDismissBtn = document.getElementById('statusDismiss');
const listEl = document.getElementById('list');
const searchBoxEl = document.getElementById('searchBox');
const tr = window.t || ((key) => key);
let allItems = [];
let statusTimer = null;

function setStatus(msg, options = {}) {
  clearTimeout(statusTimer);
  statusTimer = null;

  if (!msg) {
    statusMessageEl.textContent = '';
    statusEl.hidden = true;
    statusEl.removeAttribute('data-tone');
    statusDismissBtn.hidden = true;
    return;
  }

  const normalized = typeof options === 'boolean'
    ? { tone: options ? 'error' : 'success' }
    : options;
  const tone = normalized.tone || 'success';
  const defaultDuration = tone === 'error' || tone === 'progress' ? 0 : 3000;
  const duration = Number.isFinite(normalized.duration) ? normalized.duration : defaultDuration;

  statusMessageEl.textContent = msg;
  statusEl.dataset.tone = tone;
  statusEl.hidden = false;
  statusDismissBtn.hidden = tone !== 'error';

  if (duration > 0) {
    statusTimer = setTimeout(() => setStatus(''), duration);
  }
}

function closeActionMenus(except = null) {
  document.querySelectorAll('.entry-action-menu[open]').forEach((menu) => {
    if (menu !== except) menu.open = false;
  });
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
      if (err) return resolve({ ok: false, error: window.getUserFacingError?.(err.message) || err.message });
      if (response?.error) return resolve({ ...response, error: window.getUserFacingError?.(response.error) || response.error });
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

function validateTranscriptionName(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return tr('error_transcription_name_required');
  if (Array.from(normalized).length > 200) return tr('error_transcription_name_too_long');
  return '';
}

function beginRename(hash, entryEl) {
  const item = allItems.find((candidate) => candidate.hash === hash);
  const titleRow = entryEl?.querySelector('.entry-title-row');
  const titleEl = titleRow?.querySelector('.entry-title');
  const renameBtn = entryEl?.querySelector('[data-act="rename"]');
  if (!item || !titleEl || !renameBtn || titleEl.tagName === 'INPUT') return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-name-input';
  input.value = item.name || '';
  input.placeholder = tr('rename_name_placeholder');
  input.setAttribute('aria-label', tr('rename_transcription'));

  let finished = false;
  let saving = false;
  const cancel = () => {
    if (finished) return;
    finished = true;
    renderFilteredList();
  };
  const save = async () => {
    if (finished || saving) return;
    const validationError = validateTranscriptionName(input.value);
    if (validationError) {
      setStatus(validationError, true);
      input.focus();
      return;
    }

    saving = true;
    const resp = await sendMessage({
      type: 'RENAME_TRANSCRIPTION',
      hash,
      name: input.value.trim()
    });
    saving = false;
    if (!resp?.ok || !resp.entry) {
      setStatus(resp?.error || tr('could_not_rename'), true);
      input.focus();
      return;
    }

    finished = true;
    await load();
    setStatus(tr('rename_saved'));
  };

  titleEl.replaceWith(input);
  renameBtn.hidden = true;
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });
  input.addEventListener('blur', save);
  input.focus();
  input.select();
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
    const resourceSummary = resourceDisplay.previewSummary(item);
    const resourceIcon = resourceDisplay.iconUrl(item.resourceFormat);
    const div = document.createElement('div');
    div.className = 'entry transcription-entry';
    div.innerHTML = `
      <div class="transcription-main">
        <div class="transcription-head">
          <div class="transcription-identity">
            <div class="entry-title-row">
              <div class="entry-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            </div>
          </div>
          <div class="transcription-kind">
            ${resourceIcon ? `<img class="transcription-kind-icon" src="${escapeHtml(resourceIcon)}" alt="" aria-hidden="true">` : ''}
            <span>${escapeHtml(resourceSummary)}</span>
          </div>
        </div>
        <div class="transcription-meta">
          <span>${escapeHtml(tr('pages_count', [String(item.pages ?? 0)]))}</span>
          <span>${escapeHtml(tr('images_count', [String(item.imagesCount ?? 0)]))}</span>
          <span>${escapeHtml(tr('updated_at', [updatedAt]))}</span>
        </div>
        <details class="transcription-details">
          <summary>${escapeHtml(tr('preview_details'))}</summary>
          <div class="transcription-details-content">
            <div class="detail-line">
              <span class="meta-label">${escapeHtml(tr('original_sha_label'))}</span>
              <span class="hash-line">${escapeHtml(item.hash)}</span>
            </div>
            <div class="detail-line">
              <span class="meta-label">${escapeHtml(tr('source'))}</span>
              <span class="url-line">${escapeHtml(item.url || tr('no_registered_url'))}</span>
            </div>
            <div class="detail-line">
              <span class="meta-label">${escapeHtml(tr('created_at', [createdAt]))}</span>
            </div>
          </div>
        </details>
      </div>
      <div class="transcription-actions">
        <button class="primary" data-act="preview" data-hash="${escapeHtml(item.hash)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/></svg>
          <span>${escapeHtml(tr('preview_edit'))}</span>
        </button>
        <button class="subtle" data-act="copy" data-hash="${escapeHtml(item.hash)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
          <span>${escapeHtml(tr('copy_content'))}</span>
        </button>
        <details class="entry-action-menu">
          <summary class="button subtle" title="${escapeHtml(tr('transcription_actions_aria'))}" aria-label="${escapeHtml(tr('transcription_actions_aria'))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
          </summary>
          <div class="entry-action-menu-panel">
            <button data-act="rename" data-hash="${escapeHtml(item.hash)}" type="button">${escapeHtml(tr('rename_transcription'))}</button>
            <button data-act="export-md" data-hash="${escapeHtml(item.hash)}" type="button">${escapeHtml(tr('export_markdown'))}</button>
            <button data-act="export-images" data-hash="${escapeHtml(item.hash)}" type="button">${escapeHtml(tr('export_images'))}</button>
            <button class="danger" data-act="delete" data-hash="${escapeHtml(item.hash)}" type="button">${escapeHtml(tr('delete'))}</button>
          </div>
        </details>
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
    item.resourceOrigin,
    item.resourceProvider,
    item.resourceFormat,
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
  setStatus(tr('loading'), { tone: 'progress' });
  listEl.setAttribute('aria-busy', 'true');
  const resp = await sendMessage({ type: 'LIST_DETAILED' });
  listEl.removeAttribute('aria-busy');
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
  closeActionMenus();
  const hash = btn.getAttribute('data-hash');
  const action = btn.getAttribute('data-act');
  if (action === 'rename') {
    beginRename(hash, btn.closest('.transcription-entry'));
    return;
  }
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
statusDismissBtn.addEventListener('click', () => setStatus(''));

document.addEventListener('click', (event) => {
  const activeMenu = event.target.closest('.entry-action-menu');
  closeActionMenus(activeMenu);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const openMenu = document.querySelector('.entry-action-menu[open]');
  if (!openMenu) return;
  openMenu.open = false;
  openMenu.querySelector('summary')?.focus();
});

load();
