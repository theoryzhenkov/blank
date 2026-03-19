// Cooldown map: origin → expiresAt timestamp
// After confirming a site, further navigations to the same origin are allowed
// until the cooldown expires. Replaces the old per-tab bypass token system.
const cooldownMap = new Map();

// Minimum TTL for the immediate redirect after confirmation (covers the
// proceed → onBeforeNavigate round-trip, including Firefox multi-fire).
const MIN_REDIRECT_TTL_MS = 5_000;

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

// --- Settings cache ---

let cachedPatterns = [];
let cooldownMs = 10 * 60 * 1000; // default 10 minutes

chrome.storage.sync.get(['protectedUrls', 'cooldownMinutes']).then((result) => {
  cachedPatterns = result.protectedUrls || [];
  if (result.cooldownMinutes !== undefined) {
    cooldownMs = result.cooldownMinutes * 60 * 1000;
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.protectedUrls) {
    cachedPatterns = changes.protectedUrls.newValue || [];
  }
  if (changes.cooldownMinutes) {
    cooldownMs = (changes.cooldownMinutes.newValue ?? 10) * 60 * 1000;
  }
});

// --- Cooldown helpers ---

/**
 * Returns true if the origin of `url` is currently in cooldown
 * (i.e. the user recently confirmed it and the cooldown hasn't expired).
 */
function isInCooldown(url) {
  try {
    const origin = new URL(url).origin;
    const expiresAt = cooldownMap.get(origin);
    if (!expiresAt) return false;
    if (expiresAt > Date.now()) return true;
    // Expired — clean up
    cooldownMap.delete(origin);
    return false;
  } catch {
    return false;
  }
}

/**
 * Returns true if the origin of `url` had a cooldown entry that has now
 * expired. Used for SPA re-prompting: only interrupt if the user was
 * previously granted access and the grace period is over.
 */
function isCooldownExpired(url) {
  try {
    const origin = new URL(url).origin;
    const expiresAt = cooldownMap.get(origin);
    // No entry = never confirmed → don't intercept SPA navigation
    if (!expiresAt) return false;
    if (expiresAt > Date.now()) return false;
    // Expired
    cooldownMap.delete(origin);
    return true;
  } catch {
    return false;
  }
}

/**
 * Record that the user confirmed a protected origin. Uses the configured
 * cooldown, with a minimum of MIN_REDIRECT_TTL_MS so the immediate
 * redirect always succeeds.
 */
function setCooldown(url) {
  try {
    const origin = new URL(url).origin;
    const ttl = Math.max(cooldownMs, MIN_REDIRECT_TTL_MS);
    cooldownMap.set(origin, Date.now() + ttl);
  } catch {}
}

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

// Interstitial sends {type:'proceed', url} — background sets cooldown AND
// navigates in the same context, guaranteeing the entry exists when
// onBeforeNavigate fires.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'proceed' && sender.tab) {
    setCooldown(message.url);
    chrome.tabs.update(sender.tab.id, { url: message.url });
    sendResponse({ ok: true });
  }
});

// Main interception: full page navigations (address bar, links, reload, back/forward)
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;

  const interstitialBase = chrome.runtime.getURL('interstitial.html');
  if (details.url.startsWith(interstitialBase)) return;

  if (isInCooldown(details.url)) return;

  if (matchesProtectedUrl(details.url, cachedPatterns)) {
    const interstitialUrl =
      interstitialBase + '?url=' + encodeURIComponent(details.url);
    chrome.tabs.update(details.tabId, { url: interstitialUrl });
  }
});

// SPA interception: History API navigations (pushState / replaceState)
// Only active when cooldown is enabled (> 0). Re-prompts the user after the
// cooldown expires, even if the page never did a full navigation.
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;
  if (cooldownMs === 0) return;

  const interstitialBase = chrome.runtime.getURL('interstitial.html');
  if (details.url.startsWith(interstitialBase)) return;

  // Only intercept if there was a cooldown that has now expired
  if (!isCooldownExpired(details.url)) return;

  if (matchesProtectedUrl(details.url, cachedPatterns)) {
    const interstitialUrl =
      interstitialBase + '?url=' + encodeURIComponent(details.url);
    chrome.tabs.update(details.tabId, { url: interstitialUrl });
  }
});
