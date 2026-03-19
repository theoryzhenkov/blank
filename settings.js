/** @typedef {'light' | 'dark' | 'adaptive'} Theme */
/** @typedef {{ soundEnabled: boolean, wordCount: 3 | 5 | 7, hasTypedBefore: boolean, theme: Theme, cooldownMinutes: number }} Settings */

/** @type {Settings} */
const DEFAULTS = {
  soundEnabled: true,
  wordCount: 5,
  hasTypedBefore: false,
  theme: 'light',
  cooldownMinutes: 10,
};

const KEYS = /** @type {const} */ (Object.keys(DEFAULTS));

/** @returns {Promise<Settings>} */
export async function loadSettings() {
  const result = await chrome.storage.sync.get(KEYS);
  return { ...DEFAULTS, ...result };
}

/**
 * Merge partial settings into storage.
 * @param {Partial<Settings>} partial
 * @returns {Promise<void>}
 */
export async function saveSettings(partial) {
  await chrome.storage.sync.set(partial);
}

/** @type {MediaQueryList | null} */
let _mediaQuery = null;

/**
 * Apply the given theme by toggling the `dark` class on `<html>`.
 * For `'adaptive'`, listens to OS preference changes.
 * @param {Theme} theme
 */
export function applyTheme(theme) {
  // Clean up previous adaptive listener
  if (_mediaQuery) {
    _mediaQuery.removeEventListener('change', _onMediaChange);
    _mediaQuery = null;
  }

  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else if (theme === 'light') {
    document.documentElement.classList.remove('dark');
  } else {
    // adaptive
    _mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    _syncFromMedia(_mediaQuery);
    _mediaQuery.addEventListener('change', _onMediaChange);
  }
}

/** @param {MediaQueryListEvent} e */
function _onMediaChange(e) {
  document.documentElement.classList.toggle('dark', e.matches);
}

/** @param {MediaQueryList} mq */
function _syncFromMedia(mq) {
  document.documentElement.classList.toggle('dark', mq.matches);
}
