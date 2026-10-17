'use strict';

(function () {
  const FORMAT_ASSETS = Object.freeze({
    pdf: 'pdf.png',
    doc: 'doc.png',
    docx: 'doc.png',
    odt: 'doc.png',
    rtf: 'doc.png',
    txt: 'doc.png',
    epub: 'doc.png',
    xml: 'doc.png',
    bib: 'doc.png',
    fb2: 'doc.png',
    ipynb: 'doc.png',
    tex: 'doc.png',
    opml: 'doc.png',
    man: 'doc.png',
    ppt: 'ppt.png',
    pptx: 'ppt.png',
    xls: 'xls.png',
    xlsx: 'xls.png',
    csv: 'csv.png',
    jpg: 'img.png',
    jpeg: 'img.png',
    png: 'img.png',
    avif: 'img.png',
    tif: 'img.png',
    tiff: 'img.png',
    gif: 'img.png',
    heic: 'img.png',
    heif: 'img.png',
    bmp: 'img.png',
    webp: 'img.png'
  });

  function translate(key, fallback) {
    const value = window.t?.(key);
    return value && value !== key ? value : fallback;
  }

  function normalizedFormat(format) {
    return String(format || '').trim().toLowerCase();
  }

  function iconUrl(format) {
    const asset = FORMAT_ASSETS[normalizedFormat(format)];
    return asset ? chrome.runtime.getURL(`assets/${asset}`) : '';
  }

  function formatLabel(format) {
    const normalized = normalizedFormat(format);
    return normalized ? normalized.toUpperCase() : translate('unknown', 'Unknown');
  }

  function originLabel(item) {
    if (item?.resourceOrigin === 'google') {
      const providers = {
        'google-doc': translate('resource_google_docs', 'Google Docs'),
        'google-slides': translate('resource_google_slides', 'Google Slides'),
        'google-sheets': translate('resource_google_sheets', 'Google Sheets')
      };
      return providers[item.resourceProvider] || translate('google_source', 'Google');
    }
    return translate('non_google_source', 'Non-Google document');
  }

  function summary(item) {
    return `${originLabel(item)} · ${formatLabel(item?.resourceFormat)}`;
  }

  function previewSummary(item) {
    if (item?.resourceOrigin !== 'google') return formatLabel(item?.resourceFormat);
    return summary(item);
  }

  window.resourceDisplay = Object.freeze({
    iconUrl,
    formatLabel,
    originLabel,
    summary,
    previewSummary
  });
})();
