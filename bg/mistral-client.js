import { mimeFromExt } from './utils.js';

const API_BASE = 'https://api.mistral.ai/v1';

export const MISTRAL_ERROR_CATEGORIES = Object.freeze({
  NO_ACTIVE_USAGE_LIMIT: 'NO_ACTIVE_USAGE_LIMIT',
  RATE_LIMIT_REACHED: 'RATE_LIMIT_REACHED',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED'
});

function parseHeaderNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getRateLimitHeaders(response) {
  const headers = {};
  response?.headers?.forEach((value, name) => {
    if (name.toLowerCase().startsWith('x-ratelimit-')) headers[name] = value;
  });
  return headers;
}

export function classifyMistralError({ status, code, rateLimitHeaders = {} }) {
  const httpStatus = Number(status);
  if (httpStatus === 402) return MISTRAL_ERROR_CATEGORIES.PAYMENT_REQUIRED;

  const isRateLimitError = httpStatus === 429 || String(code || '') === '1300';
  if (!isRateLimitError) return null;

  const entries = Object.entries(rateLimitHeaders);
  const limitValues = entries
    .filter(([name]) => name.includes('limit') && !name.includes('remaining') && !name.includes('reset'))
    .map(([, value]) => parseHeaderNumber(value))
    .filter((value) => value !== null);
  const remainingValues = entries
    .filter(([name]) => name.includes('remaining'))
    .map(([, value]) => parseHeaderNumber(value))
    .filter((value) => value !== null);

  if (limitValues.some((value) => value === 0)) {
    return MISTRAL_ERROR_CATEGORIES.NO_ACTIVE_USAGE_LIMIT;
  }

  if (limitValues.some((value) => value > 0) || remainingValues.some((value) => value === 0)) {
    return MISTRAL_ERROR_CATEGORIES.RATE_LIMIT_REACHED;
  }

  return null;
}

function getErrorDescription(payload, rawBody, response) {
  const errorPayload = payload?.error && typeof payload.error === 'object'
    ? payload.error
    : payload;
  const description = errorPayload?.message
    || errorPayload?.detail
    || (typeof payload?.error === 'string' ? payload.error : '')
    || rawBody?.trim()
    || response.statusText
    || 'Mistral returned an error without a description.';
  return String(description).trim();
}

async function createMistralApiError(response) {
  const rawBody = await response.text().catch(() => '');
  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Keep the raw response as the description when it is not JSON.
  }

  const errorPayload = payload?.error && typeof payload.error === 'object'
    ? payload.error
    : payload;
  const description = getErrorDescription(payload, rawBody, response);
  const mistralCode = errorPayload?.code ?? payload?.code ?? null;
  const code = mistralCode ?? response.status;
  const rateLimitHeaders = getRateLimitHeaders(response);
  const error = new Error(description);
  error.name = 'MistralApiError';
  error.code = String(code || 'MISTRAL_API_ERROR');
  error.mistralCode = mistralCode == null ? null : String(mistralCode);
  error.status = response.status;
  error.description = description;
  error.rateLimitHeaders = rateLimitHeaders;
  error.category = classifyMistralError({
    status: response.status,
    code: mistralCode,
    rateLimitHeaders
  });
  return error;
}

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
    throw await createMistralApiError(res);
  }
  return res.json();
}

export function buildOcrBody(document, options = {}, { includeImageLimit = false } = {}) {
  const includeImages = !!options.includeImages;
  const body = {
    document,
    model: 'mistral-ocr-latest',
    include_image_base64: includeImages,
    extract_header: !!options.extractHeader,
    extract_footer: !!options.extractFooter,
    confidence_scores_granularity: 'word'
  };

  if (includeImageLimit && !includeImages) body.image_limit = 0;
  return body;
}

export async function runMistralOcrFile(fileId, apiKey, options, signal) {
  const body = {
    ...buildOcrBody({ file_id: fileId }, options || {}, { includeImageLimit: true })
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

  if (!res.ok) throw await createMistralApiError(res);
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

  if (!res.ok) throw await createMistralApiError(res);
  return res.json();
}
