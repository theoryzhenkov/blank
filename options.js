import { loadSettings, saveSettings, applyTheme } from './settings.js';
import { isValidUrlPattern } from './validation.js';

document.addEventListener('DOMContentLoaded', async () => {
  loadUrls();
  await initSettingsUI();
});

document.getElementById('urlInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addUrl();
});

// --- URL management ---

async function loadUrls() {
  const result = await chrome.storage.sync.get(['protectedUrls']);
  const urls = result.protectedUrls || [];
  renderUrls(urls);
}

function renderUrls(urls) {
  const urlList = document.getElementById('urlList');
  urlList.innerHTML = '';

  if (urls.length === 0) {
    urlList.innerHTML = '<li class="empty-state">No sites added yet</li>';
    return;
  }

  urls.forEach((url, index) => {
    const li = document.createElement('li');
    li.className = 'url-item';

    const urlSpan = document.createElement('span');
    urlSpan.className = 'url-text';
    urlSpan.textContent = url;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', () => removeUrl(index));

    li.appendChild(urlSpan);
    li.appendChild(removeBtn);
    urlList.appendChild(li);
  });
}

async function addUrl() {
  const input = document.getElementById('urlInput');
  const url = input.value.trim();

  if (!url || !isValidUrlPattern(url)) {
    input.classList.add('input-invalid');
    setTimeout(() => input.classList.remove('input-invalid'), 600);
    return;
  }

  const result = await chrome.storage.sync.get(['protectedUrls']);
  const urls = result.protectedUrls || [];

  if (urls.includes(url)) {
    input.value = '';
    return;
  }

  urls.push(url);
  await chrome.storage.sync.set({ protectedUrls: urls });

  input.value = '';
  renderUrls(urls);
}


async function removeUrl(index) {
  const result = await chrome.storage.sync.get(['protectedUrls']);
  const urls = result.protectedUrls || [];

  urls.splice(index, 1);
  await chrome.storage.sync.set({ protectedUrls: urls });

  renderUrls(urls);
}

// --- Settings UI ---

async function initSettingsUI() {
  const settings = await loadSettings();
  applyTheme(settings.theme);

  // Theme segmented buttons
  const themeGroup = document.getElementById('themeGroup');
  const themeButtons = themeGroup.querySelectorAll('button');

  for (const btn of themeButtons) {
    if (btn.dataset.theme === settings.theme) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', async () => {
      for (const b of themeButtons) b.classList.remove('active');
      btn.classList.add('active');
      const theme = /** @type {import('./settings.js').Theme} */ (btn.dataset.theme);
      await saveSettings({ theme });
      applyTheme(theme);
    });
  }

  // Word count segmented buttons
  const wordCountGroup = document.getElementById('wordCountGroup');
  const wordButtons = wordCountGroup.querySelectorAll('button');

  for (const btn of wordButtons) {
    if (Number(btn.dataset.count) === settings.wordCount) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', async () => {
      for (const b of wordButtons) b.classList.remove('active');
      btn.classList.add('active');
      await saveSettings({ wordCount: /** @type {3|5|7} */ (Number(btn.dataset.count)) });
    });
  }

  // Cooldown segmented buttons
  const cooldownGroup = document.getElementById('cooldownGroup');
  const cooldownButtons = cooldownGroup.querySelectorAll('button');

  for (const btn of cooldownButtons) {
    if (Number(btn.dataset.cooldown) === settings.cooldownMinutes) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', async () => {
      for (const b of cooldownButtons) b.classList.remove('active');
      btn.classList.add('active');
      await saveSettings({ cooldownMinutes: Number(btn.dataset.cooldown) });
    });
  }

  // Sound toggle
  const soundToggle = document.getElementById('soundToggle');
  soundToggle.setAttribute('aria-checked', String(settings.soundEnabled));

  soundToggle.addEventListener('click', async () => {
    const current = soundToggle.getAttribute('aria-checked') === 'true';
    const next = !current;
    soundToggle.setAttribute('aria-checked', String(next));
    await saveSettings({ soundEnabled: next });
  });
}
