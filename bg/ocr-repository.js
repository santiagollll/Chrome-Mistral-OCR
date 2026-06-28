import { downloadsDownload } from './chrome-api.js';
import { msg } from './i18n.js';
import { getIndex, getImageExportModePref, saveIndex } from './storage.js';
import {
  arrayBufferToBase64,
  base64ToBytes,
  base64ToDataUrl,
  createZipFromFiles,
  dataUrlFromText,
  extractMarkdownImageNames,
  pickImageFileName,
  sanitizeFileName,
  stripFileExtension
} from './utils.js';

const DB_NAME = 'mistral-ocr-db';
const DB_VERSION = 1;
const ARTIFACTS_STORE = 'ocrArtifacts';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ARTIFACTS_STORE)) {
        db.createObjectStore(ARTIFACTS_STORE, { keyPath: 'hash' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(msg('error_open_indexeddb')));
  });
}

async function withStore(mode, fn) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ARTIFACTS_STORE, mode);
      const store = tx.objectStore(ARTIFACTS_STORE);
      let settled = false;

      const finishResolve = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      tx.oncomplete = () => {
        if (!settled) finishResolve(undefined);
      };
      tx.onerror = () => finishReject(tx.error || new Error(msg('error_indexeddb_transaction_failed')));
      tx.onabort = () => finishReject(tx.error || new Error(msg('error_indexeddb_transaction_aborted')));

      Promise.resolve(fn(store, finishResolve, finishReject)).catch(finishReject);
    });
  } finally {
    db.close();
  }
}

function toUint8Array(value) {
  if (!value) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

async function downloadFileFromUrl(url, filename, conflictAction = 'overwrite') {
  return downloadsDownload({ url, filename, saveAs: false, conflictAction });
}

function buildExportBaseName(name) {
  return stripFileExtension(name || 'document');
}

async function getIndexEntryOrThrow(hash) {
  const { ocrIndex } = await getIndex();
  const entry = ocrIndex[hash];
  if (!entry) throw new Error(msg('error_ocr_entry_not_found'));
  return entry;
}

function normalizeImagesForStorage(images) {
  return images.map((image) => ({
    name: image.name,
    mimeType: image.mimeType,
    bytes: image.bytes
  }));
}

function inferImageMimeFromName(name) {
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

export async function saveOcrArtifact({ hash, markdown, images, pages, imagesCount, resourceKind, confidenceWords, confidenceDecisions }) {
  const record = {
    hash,
    markdown,
    images: normalizeImagesForStorage(images),
    pages,
    imagesCount,
    resourceKind,
    confidenceWords: Array.isArray(confidenceWords) ? confidenceWords : [],
    confidenceDecisions: confidenceDecisions && typeof confidenceDecisions === 'object' ? confidenceDecisions : {}
  };

  await withStore('readwrite', (store) => {
    store.put(record);
  });
}

export async function getOcrArtifact(hash) {
  return withStore('readonly', (store, resolve, reject) => {
    const request = store.get(hash);
    request.onsuccess = () => {
      if (!request.result) {
        reject(new Error(msg('error_ocr_not_found')));
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error(msg('error_could_not_read_ocr')));
  });
}

export async function deleteOcrArtifact(hash) {
  await withStore('readwrite', (store) => {
    store.delete(hash);
  });
}

export async function buildAndSaveOcrArtifacts({ ocr, hash, includeImages, resourceKind }) {
  let markdown = '';
  const images = [];
  const confidenceWords = [];

  for (const page of ocr.pages || []) {
    const md = page.markdown || '';
    const pageOffset = markdown.length;
    markdown += `${md}\n\n`;

    const wordScores = page.confidence_scores?.word_confidence_scores || page.confidenceScores?.wordConfidenceScores || [];
    for (const score of wordScores) {
      if (!score || typeof score.confidence !== 'number') continue;
      const startIndex = typeof score.start_index === 'number' ? score.start_index : score.startIndex;
      confidenceWords.push({
        text: String(score.text || ''),
        confidence: score.confidence,
        startIndex,
        markdownOffset: typeof startIndex === 'number' ? pageOffset + startIndex : null,
        pageIndex: page.index
      });
    }

    if (!includeImages) continue;
    const namesFromMd = extractMarkdownImageNames(md);
    const pageImages = page.images || [];
    for (let i = 0; i < pageImages.length; i++) {
      const image = pageImages[i];
      const base64 = image.image_base64 || image.imageBase64;
      if (!base64) continue;
      const bytes = base64ToBytes(base64);
      const name = pickImageFileName(i, page, namesFromMd, image);
      images.push({
        name,
        mimeType: inferImageMimeFromName(name),
        bytes
      });
    }
  }

  await saveOcrArtifact({
    hash,
    markdown,
    images,
    pages: (ocr.pages || []).length,
    imagesCount: includeImages ? images.length : 0,
    resourceKind,
    confidenceWords,
    confidenceDecisions: {}
  });

  return {
    markdown,
    imagesCount: includeImages ? images.length : 0,
    pages: (ocr.pages || []).length
  };
}

export async function listEntries() {
  const { ocrIndex } = await getIndex();
  return Object.values(ocrIndex)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => ({
      hash: entry.hash,
      name: entry.name,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      pages: entry.pages,
      imagesCount: entry.imagesCount,
      resourceKind: entry.resourceKind
    }));
}

export async function listDetailedEntries() {
  const { ocrIndex } = await getIndex();
  return Object.values(ocrIndex)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => ({
      hash: entry.hash,
      name: entry.name,
      url: entry.url,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      pages: entry.pages,
      imagesCount: entry.imagesCount,
      resourceKind: entry.resourceKind
    }));
}

export async function checkExistingForUrl(resourceUrl) {
  const { urlToHash, ocrIndex } = await getIndex();
  const hash = urlToHash[resourceUrl];
  if (hash && ocrIndex[hash]) return { found: true, hash, entry: ocrIndex[hash] };
  return { found: false };
}

export async function checkExistingForUrls(resourceUrls) {
  const urls = Array.from(new Set((Array.isArray(resourceUrls) ? resourceUrls : [resourceUrls]).filter(Boolean)));
  const { urlToHash, ocrIndex } = await getIndex();
  for (const url of urls) {
    const hash = urlToHash[url];
    if (hash && ocrIndex[hash]) return { found: true, hash, entry: ocrIndex[hash], matchedUrl: url };
  }
  return { found: false };
}

export async function deleteEntry(hash) {
  const { ocrIndex, urlToHash } = await getIndex();
  if (!ocrIndex[hash]) return { ok: true };

  delete ocrIndex[hash];
  for (const [url, currentHash] of Object.entries(urlToHash)) {
    if (currentHash === hash) delete urlToHash[url];
  }
  await saveIndex(ocrIndex, urlToHash);
  await deleteOcrArtifact(hash);
  return { ok: true };
}

export async function getMarkdown(hash) {
  const artifact = await getOcrArtifact(hash);
  if (!artifact.markdown) throw new Error(msg('error_no_stored_content'));
  return { ok: true, content: artifact.markdown };
}

export async function getPreviewData(hash) {
  const entry = await getIndexEntryOrThrow(hash);
  const artifact = await getOcrArtifact(hash);
  const images = (artifact.images || []).map((image) => {
    const base64 = arrayBufferToBase64(toUint8Array(image.bytes));
    const mimeType = image.mimeType || inferImageMimeFromName(image.name);
    return {
      name: image.name,
      mimeType,
      dataUrl: `data:${mimeType};base64,${base64}`
    };
  });

  return {
    ok: true,
    item: {
      hash: entry.hash,
      name: entry.name,
      markdown: artifact.markdown || '',
      images,
      confidenceWords: Array.isArray(artifact.confidenceWords) ? artifact.confidenceWords : [],
      confidenceDecisions: artifact.confidenceDecisions && typeof artifact.confidenceDecisions === 'object' ? artifact.confidenceDecisions : {},
      pages: artifact.pages ?? entry.pages ?? 0,
      imagesCount: artifact.imagesCount ?? entry.imagesCount ?? images.length,
      resourceKind: artifact.resourceKind || entry.resourceKind || null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    }
  };
}

export async function updateMarkdown(hash, markdown) {
  const { ocrIndex, urlToHash } = await getIndex();
  const entry = ocrIndex[hash];
  if (!entry) throw new Error(msg('error_ocr_entry_not_found'));

  const artifact = await getOcrArtifact(hash);
  await saveOcrArtifact({
    ...artifact,
    hash,
    markdown: String(markdown || ''),
    images: artifact.images || [],
    pages: artifact.pages ?? entry.pages ?? 0,
    imagesCount: artifact.imagesCount ?? entry.imagesCount ?? 0,
    resourceKind: artifact.resourceKind || entry.resourceKind || null,
    confidenceWords: artifact.confidenceWords || [],
    confidenceDecisions: artifact.confidenceDecisions || {}
  });

  ocrIndex[hash] = {
    ...entry,
    updatedAt: Date.now()
  };
  await saveIndex(ocrIndex, urlToHash);
  return getPreviewData(hash);
}

export async function updateConfidenceDecision(hash, key, decision) {
  const artifact = await getOcrArtifact(hash);
  const normalizedKey = String(key || '');
  if (!normalizedKey) throw new Error(msg('error_missing_word_identifier'));
  const normalizedDecision = 'keep';
  const confidenceDecisions = {
    ...(artifact.confidenceDecisions || {}),
    [normalizedKey]: normalizedDecision
  };

  await saveOcrArtifact({
    ...artifact,
    hash,
    markdown: artifact.markdown || '',
    images: artifact.images || [],
    pages: artifact.pages ?? 0,
    imagesCount: artifact.imagesCount ?? 0,
    resourceKind: artifact.resourceKind || null,
    confidenceWords: artifact.confidenceWords || [],
    confidenceDecisions
  });

  return getPreviewData(hash);
}

export async function updateConfidenceDecisions(hash, keys) {
  const artifact = await getOcrArtifact(hash);
  const normalizedKeys = Array.from(new Set((Array.isArray(keys) ? keys : []).map((key) => String(key || '')).filter(Boolean)));
  if (!normalizedKeys.length) throw new Error(msg('error_missing_word_identifiers'));

  const confidenceDecisions = {
    ...(artifact.confidenceDecisions || {})
  };
  for (const key of normalizedKeys) {
    confidenceDecisions[key] = 'keep';
  }

  await saveOcrArtifact({
    ...artifact,
    hash,
    markdown: artifact.markdown || '',
    images: artifact.images || [],
    pages: artifact.pages ?? 0,
    imagesCount: artifact.imagesCount ?? 0,
    resourceKind: artifact.resourceKind || null,
    confidenceWords: artifact.confidenceWords || [],
    confidenceDecisions
  });

  return getPreviewData(hash);
}

export async function exportMarkdown(hash) {
  const entry = await getIndexEntryOrThrow(hash);
  const artifact = await getOcrArtifact(hash);
  const url = dataUrlFromText(artifact.markdown || '', 'text/markdown');
  await downloadFileFromUrl(url, `${buildExportBaseName(entry.name)}.md`);
  return { ok: true };
}

async function exportImagesAsSeparateFiles(entry, artifact) {
  const exportBaseName = buildExportBaseName(entry.name);
  for (const image of artifact.images || []) {
    const base64 = arrayBufferToBase64(toUint8Array(image.bytes));
    const url = base64ToDataUrl(base64, image.name);
    const imageName = sanitizeFileName(image.name || 'image.jpeg', 'image.jpeg');
    await downloadFileFromUrl(url, `${exportBaseName} - ${imageName}`);
  }
  return { ok: true };
}

async function exportImagesAsZip(entry, artifact) {
  const files = (artifact.images || []).map((image) => ({
    name: sanitizeFileName(image.name || 'image.jpeg', 'image.jpeg'),
    bytes: toUint8Array(image.bytes)
  }));
  const zipBytes = createZipFromFiles(files);
  const base64 = arrayBufferToBase64(zipBytes);
  const url = `data:application/zip;base64,${base64}`;
  await downloadFileFromUrl(url, `${buildExportBaseName(entry.name)}.zip`);
  return { ok: true };
}

export async function exportImages(hash) {
  const entry = await getIndexEntryOrThrow(hash);
  const artifact = await getOcrArtifact(hash);
  if (!artifact.images?.length) return { ok: false, error: msg('error_ocr_has_no_images') };

  const mode = await getImageExportModePref();
  if (mode === 'separate') return exportImagesAsSeparateFiles(entry, artifact);
  return exportImagesAsZip(entry, artifact);
}
