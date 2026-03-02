/**
 * Validates that a string looks like a plausible URL pattern.
 * Accepts bare domains ("twitter.com"), wildcards ("*.reddit.com"),
 * and full URLs ("https://example.com").
 *
 * @param {string} str
 * @returns {boolean}
 */
export function isValidUrlPattern(str) {
  const cleaned = str.replace(/^\*+|\*+$/g, '');
  if (!cleaned.includes('.')) return false;
  try {
    new URL(cleaned.startsWith('http') ? cleaned : 'http://' + cleaned);
    return true;
  } catch {
    return false;
  }
}
