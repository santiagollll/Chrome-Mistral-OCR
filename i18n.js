'use strict';

(function () {
  const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
  const DEFAULT_FAVICON_PATH = 'icon32.png';

  function currentLanguage() {
    const lang = chrome.i18n.getUILanguage?.() || chrome.i18n.getMessage('@@ui_locale') || 'en';
    return String(lang).replace('_', '-');
  }

  function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  function applyText(el, key) {
    const value = t(key);
    if (value) el.textContent = value;
  }

  function applyAttr(el, attr, key) {
    const value = t(key);
    if (value) el.setAttribute(attr, value);
  }

  function setFavicon(href) {
    if (!href) return;
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = href;
  }

  async function refreshDocumentIcon() {
    try {
      const { customActionIconPngs = null } = await chrome.storage.local.get(['customActionIconPngs']);
      const customHref = customActionIconPngs?.['32'] || customActionIconPngs?.['48'] || customActionIconPngs?.['128'] || null;
      setFavicon(customHref || chrome.runtime.getURL(DEFAULT_FAVICON_PATH));
    } catch {
      setFavicon(chrome.runtime.getURL(DEFAULT_FAVICON_PATH));
    }
  }

  function localizeDocument(root = document) {
    const lang = currentLanguage();
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS.has(lang.split('-')[0]) ? 'rtl' : 'ltr';

    root.querySelectorAll('[data-i18n]').forEach((el) => applyText(el, el.dataset.i18n));
    root.querySelectorAll('[data-i18n-title]').forEach((el) => applyAttr(el, 'title', el.dataset.i18nTitle));
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => applyAttr(el, 'placeholder', el.dataset.i18nPlaceholder));
    root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => applyAttr(el, 'aria-label', el.dataset.i18nAriaLabel));
  }

  window.t = t;
  window.localizeDocument = localizeDocument;
  window.refreshDocumentIcon = refreshDocumentIcon;

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.customActionIconPngs) {
      refreshDocumentIcon();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      localizeDocument();
      refreshDocumentIcon();
    }, { once: true });
  } else {
    localizeDocument();
    refreshDocumentIcon();
  }
})();
