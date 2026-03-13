// Bypass tokens: Map<tabId, {url, expiresAt}>
const bypassTokens = new Map();
const BYPASS_TTL_MS = 30_000;

/** @param {string} a @param {string} b */
function sameOrigin(a, b) {
  try { return new URL(a).origin === new URL(b).origin; }
  catch { return false; }
}

/**
 * Escape regex-special chars except `*`, then convert `*` to `.*`.
 */
function escapeAndWildcard(str) {
  return str
    .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
    .replace(/\*/g, '.*');
}

/**
 * Convert a user-entered pattern (e.g. "twitter.com") into a RegExp that
 * matches the full URL including optional subdomains.
 *
 * Rules:
 *  - Dots are escaped
 *  - `*` becomes `.*`
 *  - Pattern is wrapped to match optional protocol + optional subdomains
 *  - Anchored to prevent partial domain matches (e.g. "nottwitter.com")
 */
function patternToRegex(pattern) {
  const trimmed = pattern.trim();
  if (!trimmed) return null;

  // If the pattern includes a protocol, extract and preserve it
  if (/^https?:\/\//i.test(trimmed)) {
    const match = trimmed.match(/^(https?:\/\/)(.*)/i);
    const protocol = escapeAndWildcard(match[1]);
    const rest = escapeAndWildcard(match[2]);
    return new RegExp(`^${protocol}([^/]*\\.)?${rest}(/.*)?$`, 'i');
  }

  // Otherwise, match http(s) + optional subdomains
  const escaped = escapeAndWildcard(trimmed);
  return new RegExp(
    `^https?://([^/]*\\.)?${escaped}(/.*)?$`,
    'i',
  );
}

/**
 * Returns true if `url` matches any of the user-supplied patterns.
 * Invalid patterns are logged and skipped.
 */
function matchesProtectedUrl(url, patterns) {
  for (const pattern of patterns) {
    try {
      const regex = patternToRegex(pattern);
      if (regex && regex.test(url)) return true;
    } catch (e) {
      console.warn('[Blank] Invalid pattern, skipping:', pattern, e);
    }
  }
  return false;
}

// --- Pattern cache ---

let cachedPatterns = [];

chrome.storage.sync.get(['protectedUrls']).then((result) => {
  cachedPatterns = result.protectedUrls || [];
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.protectedUrls) {
    cachedPatterns = changes.protectedUrls.newValue || [];
  }
});

// --- Listeners ---

// Open welcome page on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

// Extension icon → open options
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Interstitial sends {type:'proceed', url} — background sets token AND navigates
// in the same context, guaranteeing the token exists when onBeforeNavigate fires.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'proceed' && sender.tab) {
    bypassTokens.set(sender.tab.id, {
      url: message.url,
      expiresAt: Date.now() + BYPASS_TTL_MS,
    });
    chrome.tabs.update(sender.tab.id, { url: message.url });
    sendResponse({ ok: true });
  }
});

// Clean up tokens when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  bypassTokens.delete(tabId);
});

// Main interception logic
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only main frame
  if (details.frameId !== 0) return;

  const interstitialBase = chrome.runtime.getURL('interstitial.html');

  // Never intercept the interstitial itself
  if (details.url.startsWith(interstitialBase)) return;

  // Check for a valid bypass token.
  // Don't delete on consumption — Firefox fires onBeforeNavigate multiple
  // times for the same navigation due to process switches. Token expires via TTL.
  const token = bypassTokens.get(details.tabId);
  if (token && sameOrigin(token.url, details.url) && token.expiresAt > Date.now()) {
    return;
  }

  if (matchesProtectedUrl(details.url, cachedPatterns)) {
    const interstitialUrl =
      interstitialBase + '?url=' + encodeURIComponent(details.url);
    chrome.tabs.update(details.tabId, { url: interstitialUrl });
  }
});
