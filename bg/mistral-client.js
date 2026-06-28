import { msg } from './i18n.js';
import { mimeFromExt } from './utils.js';

const API_BASE = 'https://api.mistral.ai/v1';

function fileMimeFromName(fileName, fallbackType) {
  if (fallbackType) return fallbackType.split(';')[0];
  const ext = (String(fileName || '').split('.').pop() || '').toLowerCase();
  return mimeFromExt(ext);
}

export async function uploadFileToMistralOcr(ab, fileName, apiKey, signal, contentType = '') {
  const file = new File([ab], fileName, { type: fileMimeFromName(fileName, contentType) });
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', 'ocr');

  const res = await fetch(`${API_BASE}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal
  });

  if (!res.ok) {
    throw new Error(msg('error_uploading_to_mistral', [String(res.status), await res.text().catch(() => '')]));
  }
  return res.json();
}

function buildOcrBody(document, options) {
  return {
    document,
    model: 'mistral-ocr-latest',
    include_image_base64: !!options.includeImages,
    extract_header: !!options.extractHeader,
    extract_footer: !!options.extractFooter,
    confidence_scores_granularity: 'word'
  };
}

export async function runMistralOcrFile(fileId, apiKey, options, signal) {
  const body = {
    ...buildOcrBody({ file_id: fileId }, options || {})
  };

  const res = await fetch(`${API_BASE}/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) throw new Error(msg('error_ocr', [String(res.status), await res.text().catch(() => '')]));
  return res.json();
}

export async function runMistralOcrImage(imageDataUrl, apiKey, options, signal) {
  const body = {
    ...buildOcrBody({ type: 'image_url', image_url: imageDataUrl }, options || {})
  };

  const res = await fetch(`${API_BASE}/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) throw new Error(msg('error_ocr_image', [String(res.status), await res.text().catch(() => '')]));
  return res.json();
}
