import { loadSettings, applyTheme } from './settings.js';
import { isValidUrlPattern } from './validation.js';

const TOTAL_STEPS = 4;

/** @type {number} */
let currentStep = 0;

/** @type {string[]} */
let customUrls = [];

const steps = document.querySelectorAll('.step');
const dots = document.querySelectorAll('.dot');
const toggleAllBtn = document.getElementById('toggleAll');
const customInput = document.getElementById('customUrlInput');
const customList = document.getElementById('customUrlList');
const closeBtn = document.getElementById('closeBtn');

// --- Init ---

loadSettings().then((s) => applyTheme(s.theme));
goToStep(0);

// --- Navigation ---

document.querySelectorAll('[data-next]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = Number(/** @type {HTMLElement} */ (btn).dataset.next);
    if (currentStep === 1) saveUrls();
    goToStep(next);
  });
});

document.querySelectorAll('[data-prev]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const prev = Number(/** @type {HTMLElement} */ (btn).dataset.prev);
    goToStep(prev);
  });
});

closeBtn.addEventListener('click', () => window.close());

/** @param {number} n */
function goToStep(n) {
  currentStep = n;

  steps.forEach((step, i) => {
    step.classList.toggle('active', i === n);
  });

  dots.forEach((dot, i) => {
    dot.classList.remove('active', 'completed');
    if (i === n) dot.classList.add('active');
    else if (i < n) dot.classList.add('completed');
  });
}

// --- Preset checkboxes ---

const presetCheckboxes = /** @type {NodeListOf<HTMLInputElement>} */ (
  document.querySelectorAll('#presetList input[type="checkbox"]')
);

toggleAllBtn.addEventListener('click', () => {
  const allChecked = [...presetCheckboxes].every((cb) => cb.checked);
  presetCheckboxes.forEach((cb) => (cb.checked = !allChecked));
  updateToggleLabel();
});

presetCheckboxes.forEach((cb) => {
  cb.addEventListener('change', updateToggleLabel);
});

function updateToggleLabel() {
  const allChecked = [...presetCheckboxes].every((cb) => cb.checked);
  toggleAllBtn.textContent = allChecked ? 'Deselect all' : 'Select all';
}

updateToggleLabel();

// --- Custom URL input ---

customInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addCustomUrl();
});

function addCustomUrl() {
  const value = customInput.value.trim();

  if (!value || !isValidUrlPattern(value)) {
    customInput.classList.add('input-invalid');
    setTimeout(() => customInput.classList.remove('input-invalid'), 600);
    return;
  }

  if (customUrls.includes(value)) {
    customInput.value = '';
    return;
  }

  customUrls.push(value);
  customInput.value = '';
  renderCustomUrls();
}

/** @param {number} index */
function removeCustomUrl(index) {
  customUrls.splice(index, 1);
  renderCustomUrls();
}

function renderCustomUrls() {
  customList.innerHTML = '';
  customUrls.forEach((url, i) => {
    const li = document.createElement('li');
    li.className = 'custom-url-item';

    const span = document.createElement('span');
    span.textContent = url;

    const btn = document.createElement('button');
    btn.className = 'custom-url-remove';
    btn.innerHTML = '&times;';
    btn.addEventListener('click', () => removeCustomUrl(i));

    li.appendChild(span);
    li.appendChild(btn);
    customList.appendChild(li);
  });
}

// --- URL saving ---

async function saveUrls() {
  /** @type {string[]} */
  const urls = [];

  presetCheckboxes.forEach((cb) => {
    if (cb.checked) {
      const values = cb.dataset.urls.split(',');
      urls.push(...values);
    }
  });

  urls.push(...customUrls);
  await chrome.storage.sync.set({ protectedUrls: urls });
}

