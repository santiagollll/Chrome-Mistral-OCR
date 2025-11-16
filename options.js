'use strict';

const apiKeyEl = document.getElementById('apiKey');
const saveBtn = document.getElementById('save');
const msgEl = document.getElementById('msg');

function setMsg(t, isErr = false) {
  msgEl.textContent = t || '';
  msgEl.style.color = isErr ? '#b00' : '#333';
}

async function load() {
  chrome.storage.local.get(['apiKey'], ({ apiKey }) => {
    if (apiKey) apiKeyEl.value = apiKey;
  });
}

saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) {
    setMsg('Introduce una API key.', true);
    return;
  }
  await chrome.storage.local.set({ apiKey });
  setMsg('Guardado.');
});

load();