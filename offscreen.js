'use strict';

import { runMistralOcrFile, runMistralOcrImage, uploadFileToMistralOcr } from './bg/mistral-client.js';
import { arrayBufferToBase64, base64ToArrayBuffer, guessImageMime } from './bg/utils.js';

let currentJob = null;
let currentController = null;

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

function sendProgress(jobId, step, message) {
  return sendMessage({
    target: 'background',
    type: 'OCR_OFFSCREEN_PROGRESS',
    jobId,
    step,
    message
  });
}

async function runJob(payload) {
  currentJob = payload;
  currentController = new AbortController();
  const { signal } = currentController;

  try {
    const ab = base64ToArrayBuffer(payload.bytesB64);
    let ocr;

    if (payload.type === 'pdf' || payload.type === 'file') {
      const fallbackName = payload.type === 'pdf' ? 'document.pdf' : 'document';
      await sendProgress(payload.jobId, 'step_uploading_to_mistral', 'uploading_file_to_mistral');
      const upload = await uploadFileToMistralOcr(
        ab,
        payload.initialName || fallbackName,
        payload.apiKey,
        signal,
        payload.contentType
      );
      if (!upload?.id) throw new Error('error_upload_response_missing_file_id');

      await sendProgress(payload.jobId, 'step_running_ocr', 'waiting_mistral_ocr_response');
      ocr = await runMistralOcrFile(upload.id, payload.apiKey, {
        includeImages: payload.includeImages,
        extractHeader: payload.extractHeader,
        extractFooter: payload.extractFooter
      }, signal);
    } else if (payload.type === 'image') {
      const mime = guessImageMime(payload.url, payload.contentType);
      const dataUrl = `data:${mime};base64,${arrayBufferToBase64(ab)}`;

      await sendProgress(payload.jobId, 'step_running_ocr', 'processing_image_in_mistral');
      ocr = await runMistralOcrImage(dataUrl, payload.apiKey, {
        includeImages: payload.includeImages,
        extractHeader: payload.extractHeader,
        extractFooter: payload.extractFooter
      }, signal);
    } else {
      throw new Error('error_unsupported_background_resource');
    }

    await sendMessage({
      target: 'background',
      type: 'OCR_OFFSCREEN_COMPLETE',
      jobId: payload.jobId,
      ocr
    });
  } catch (error) {
    await sendMessage({
      target: 'background',
      type: 'OCR_OFFSCREEN_ERROR',
      jobId: payload.jobId,
      error: error?.message || String(error),
      cancelled: error?.name === 'AbortError' || /abort|cancel/i.test(error?.message || '')
    });
  } finally {
    currentJob = null;
    currentController = null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;

  if (msg.type === 'START_OFFSCREEN_OCR') {
    if (currentJob) {
      sendResponse({ ok: false, error: 'error_offscreen_ocr_running' });
      return false;
    }
    runJob(msg.payload);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'CANCEL_OFFSCREEN_OCR') {
    if (currentJob?.jobId === msg.jobId && currentController) {
      currentController.abort(new DOMException(msg.reason || 'canceled', 'AbortError'));
    }
    sendResponse({ ok: true });
    return false;
  }

  sendResponse({ ok: false, error: 'error_unsupported_offscreen_message' });
  return false;
});
