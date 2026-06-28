import { storage } from './storage.js';

const DEFAULT_ICON_PATHS = {
  16: 'icon16.png',
  32: 'icon32.png',
  48: 'icon48.png',
  128: 'icon128.png'
};

async function dataUrlToImageData(dataUrl, size) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.clearRect(0, 0, size, size);
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
  const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
  const offsetX = Math.round((size - drawWidth) / 2);
  const offsetY = Math.round((size - drawHeight) / 2);
  ctx.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight);
  return ctx.getImageData(0, 0, size, size);
}

export async function applyStoredCustomActionIcon() {
  const { customActionIconPngs = null } = await storage.get(['customActionIconPngs']);
  if (!customActionIconPngs || typeof customActionIconPngs !== 'object') {
    await chrome.action.setIcon({ path: DEFAULT_ICON_PATHS });
    return false;
  }

  const imageData = {};
  for (const size of [16, 32, 48, 128]) {
    const dataUrl = customActionIconPngs[String(size)];
    if (!dataUrl) continue;
    imageData[size] = await dataUrlToImageData(dataUrl, size);
  }

  if (!Object.keys(imageData).length) {
    await chrome.action.setIcon({ path: DEFAULT_ICON_PATHS });
    return false;
  }

  await chrome.action.setIcon({ imageData });
  return true;
}

export async function saveAndApplyCustomActionIcon({ iconUrl, pngs }) {
  await storage.set({
    customActionIconUrl: iconUrl,
    customActionIconPngs: pngs
  });
  await applyStoredCustomActionIcon();
}

export async function resetCustomActionIcon() {
  await storage.remove(['customActionIconUrl', 'customActionIconPngs']);
  await chrome.action.setIcon({ path: DEFAULT_ICON_PATHS });
}
