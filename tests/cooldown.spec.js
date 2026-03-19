// @ts-check
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const PROTECTED_PATTERN = 'httpbin.org';
const PROTECTED_URL = 'https://httpbin.org/html';
const PROTECTED_URL_ALT = 'https://httpbin.org/get';

/**
 * Build a temp extension directory with manifest.json.
 */
function buildExtensionDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blank-ext-'));
  const sources = [
    'background.js', 'click.js', 'color.js', 'fonts.css', 'fonts', 'icons',
    'interstitial.html', 'interstitial.js', 'options.html', 'options.js',
    'settings.js', 'validation.js', 'waveform.js', 'welcome.html',
    'welcome.js', 'words.js',
  ];
  for (const src of sources) {
    fs.cpSync(path.join(PROJECT_ROOT, src), path.join(tmpDir, src), { recursive: true });
  }
  fs.copyFileSync(
    path.join(PROJECT_ROOT, 'manifest.chrome.json'),
    path.join(tmpDir, 'manifest.json'),
  );
  return tmpDir;
}

/**
 * Launch a browser with the extension loaded.
 */
async function launchWithExtension(cooldownMinutes = 10) {
  const extDir = buildExtensionDir();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blank-profile-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  }

  // Configure test settings
  await serviceWorker.evaluate(
    ([pattern, cd]) => {
      chrome.storage.sync.set({
        protectedUrls: [pattern],
        cooldownMinutes: cd,
      });
    },
    [PROTECTED_PATTERN, cooldownMinutes],
  );
  await new Promise((r) => setTimeout(r, 300));

  // Close the welcome tab
  for (const page of context.pages()) {
    if (page.url().includes('welcome.html')) {
      await page.close();
    }
  }

  return {
    context,
    serviceWorker,
    _cleanup: () => {
      fs.rmSync(extDir, { recursive: true, force: true });
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Navigate to a protected URL. The extension intercepts and redirects to the
 * interstitial via chrome.tabs.update, which aborts the original navigation.
 * We fire-and-forget the goto and poll until the interstitial page is visible.
 */
async function navigateToProtected(page, url) {
  page.goto(url).catch(() => {});
  // Poll until the extension redirect settles on the interstitial page
  await expect(page).toHaveURL(/interstitial\.html/, { timeout: 10000 });
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Type the interstitial words and press Enter to proceed.
 */
async function typeInterstitialWords(page) {
  await page.waitForSelector('.word .letter', { timeout: 5000 });

  const words = await page.$$eval('.word', (wordEls) =>
    wordEls.map((el) => el.dataset.word),
  );

  for (const word of words) {
    for (const letter of word) {
      await page.keyboard.press(letter);
    }
  }

  await page.waitForSelector('#confirmHint.visible', { timeout: 3000 });
  await page.keyboard.press('Enter');
}

test.describe('cooldown bypass', () => {
  let context;
  let sw;
  let cleanup;

  test.afterEach(async () => {
    if (context) await context.close();
    if (cleanup) cleanup();
  });

  test('first navigation to protected site shows interstitial', async () => {
    ({ context, serviceWorker: sw, _cleanup: cleanup } = await launchWithExtension(10));
    const page = context.pages()[0] || (await context.newPage());

    await navigateToProtected(page, PROTECTED_URL);

    expect(page.url()).toContain('interstitial.html');
    await expect(page.locator('.word')).toHaveCount(5); // default word count
  });

  test('reload within cooldown does not show interstitial', async () => {
    ({ context, serviceWorker: sw, _cleanup: cleanup } = await launchWithExtension(10));
    const page = context.pages()[0] || (await context.newPage());

    // Navigate and confirm
    await navigateToProtected(page, PROTECTED_URL);
    await typeInterstitialWords(page);
    await page.waitForURL(/httpbin\.org\/html/, { timeout: 5000 });

    // Reload — should NOT trigger interstitial
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('httpbin.org');
    expect(page.url()).not.toContain('interstitial.html');
  });

  test('navigating to different path on same origin within cooldown is allowed', async () => {
    ({ context, serviceWorker: sw, _cleanup: cleanup } = await launchWithExtension(10));
    const page = context.pages()[0] || (await context.newPage());

    // Navigate and confirm
    await navigateToProtected(page, PROTECTED_URL);
    await typeInterstitialWords(page);
    await page.waitForURL(/httpbin\.org\/html/, { timeout: 5000 });

    // Navigate to another path on same origin — should be allowed
    await page.goto(PROTECTED_URL_ALT, { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('httpbin.org/get');
    expect(page.url()).not.toContain('interstitial.html');
  });

  test('new tab to same origin within cooldown is allowed', async () => {
    ({ context, serviceWorker: sw, _cleanup: cleanup } = await launchWithExtension(10));
    const page = context.pages()[0] || (await context.newPage());

    // Navigate and confirm on first tab
    await navigateToProtected(page, PROTECTED_URL);
    await typeInterstitialWords(page);
    await page.waitForURL(/httpbin\.org\/html/, { timeout: 5000 });

    // Open a new tab to the same site — should be allowed
    const newPage = await context.newPage();
    await newPage.goto(PROTECTED_URL_ALT, { waitUntil: 'domcontentloaded' });
    expect(newPage.url()).toContain('httpbin.org');
    expect(newPage.url()).not.toContain('interstitial.html');
  });

  test('navigation after cooldown expires shows interstitial again', async () => {
    // cooldown=0 falls back to the 5s MIN_REDIRECT_TTL_MS
    ({ context, serviceWorker: sw, _cleanup: cleanup } = await launchWithExtension(0));
    const page = context.pages()[0] || (await context.newPage());

    // Navigate and confirm
    await navigateToProtected(page, PROTECTED_URL);
    await typeInterstitialWords(page);
    await page.waitForURL(/httpbin\.org\/html/, { timeout: 5000 });

    // Wait for the 5-second grace period to expire
    await new Promise((r) => setTimeout(r, 6000));

    // Navigate again — should show interstitial
    await navigateToProtected(page, PROTECTED_URL_ALT);
    expect(page.url()).toContain('interstitial.html');
  });

  test('cooldown is origin-scoped, not pattern-scoped', async () => {
    ({ context, serviceWorker: sw, _cleanup: cleanup } = await launchWithExtension(10));

    // Add a second protected pattern
    await sw.evaluate(() => {
      chrome.storage.sync.set({
        protectedUrls: ['httpbin.org', 'example.com'],
      });
    });
    await new Promise((r) => setTimeout(r, 300));

    const page = context.pages()[0] || (await context.newPage());

    // Confirm httpbin.org
    await navigateToProtected(page, PROTECTED_URL);
    await typeInterstitialWords(page);
    await page.waitForURL(/httpbin\.org\/html/, { timeout: 5000 });

    // example.com should still be protected (different origin)
    await navigateToProtected(page, 'https://example.com');
    expect(page.url()).toContain('interstitial.html');
  });
});
