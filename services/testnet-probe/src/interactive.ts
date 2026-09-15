import fs from 'node:fs';
import { chromium } from 'playwright';

/**
 * Some sandboxes pre-install a Chromium build at a fixed path (env
 * PLAYWRIGHT_BROWSERS_PATH) that doesn't match the exact revision this
 * npm package's own `chromium.launch()` expects, causing "Executable
 * doesn't exist" even though a perfectly usable browser is present. If
 * such a pre-installed binary exists, launch it directly instead of
 * relying on Playwright's own bundled-revision lookup.
 */
function preinstalledChromiumPath(): string | undefined {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersPath) return undefined;
  const candidate = `${browsersPath}/chromium`;
  return fs.existsSync(candidate) ? candidate : undefined;
}

/**
 * Drives the SEP-24 interactive deposit page headlessly. testanchor.stellar.org's
 * demo interactive flow presents a simple amount form (and sometimes a
 * confirm/KYC step); this fills any numeric input with `amount` and clicks
 * through obvious "continue/submit/confirm" buttons until the page closes
 * itself (interactive flows call `window.close()` or postMessage on
 * completion) or `timeoutMs` elapses.
 *
 * This is a best-effort generic driver, not a testanchor-specific scraper:
 * it makes no assumption about exact field names, only common patterns.
 *
 * Known limitation (confirmed by driving this same URL through a real,
 * non-headless browser vs. Playwright's headless Chromium): the reference
 * UI at anchor-ref-ui-testanchor.stellar.org can get stuck on its initial
 * "Starting session..." screen and never render the form at all when
 * loaded by Playwright's headless Chromium, while the identical URL loads
 * fine in an ordinary browser — consistent with Cloudflare (or similar)
 * bot mitigation fingerprinting headless Chromium and never resolving the
 * page's startup request. This function deliberately does not attempt any
 * headless-detection evasion (stealth plugins, fingerprint spoofing, etc.)
 * — when this happens, `tryFillAndSubmit` simply never finds any inputs to
 * fill, the loop exits immediately, and the probe honestly reports a
 * RealTestnet failure rather than fabricating a success.
 */
export async function completeInteractiveFlow(url: string, amount: string, timeoutMs: number): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: preinstalledChromiumPath(),
  });
  try {
    const page = await browser.newPage();
    const deadline = Date.now() + timeoutMs;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    while (Date.now() < deadline && !page.isClosed()) {
      const filledSomething = await tryFillAndSubmit(page, amount);
      if (!filledSomething) {
        break;
      }
      await page.waitForTimeout(1000);
    }
  } finally {
    if (browser.isConnected()) {
      await browser.close();
    }
  }
}

async function tryFillAndSubmit(page: import('playwright').Page, amount: string): Promise<boolean> {
  let didSomething = false;

  const numberInputs = page.locator('input[type="number"], input[name*="amount" i]');
  const numberCount = await numberInputs.count().catch(() => 0);
  for (let i = 0; i < numberCount; i++) {
    const input = numberInputs.nth(i);
    if (await input.isVisible().catch(() => false)) {
      const current = await input.inputValue().catch(() => '');
      if (!current) {
        await input.fill(amount).catch(() => undefined);
        didSomething = true;
      }
    }
  }

  // testanchor.stellar.org's reference UI also requires an `email` field
  // (type="email", not "text") — leaving it empty keeps Submit disabled and
  // the flow stalls until timeout. Filling only input[type="text"] missed
  // this, so match email/tel too.
  const textInputs = page.locator(
    'input[type="text"]:not([name*="amount" i]), input[type="email"], input[type="tel"]',
  );
  const textCount = await textInputs.count().catch(() => 0);
  for (let i = 0; i < Math.min(textCount, 5); i++) {
    const input = textInputs.nth(i);
    if (await input.isVisible().catch(() => false)) {
      const current = await input.inputValue().catch(() => '');
      if (!current) {
        const type = await input.getAttribute('type').catch(() => null);
        await input.fill(type === 'email' ? 'probe@example.com' : 'Test User').catch(() => undefined);
        didSomething = true;
      }
    }
  }

  const submitButton = page
    .locator('button:has-text("Submit"), button:has-text("Continue"), button:has-text("Confirm"), button[type="submit"]')
    .first();
  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click().catch(() => undefined);
    didSomething = true;
  }

  return didSomething;
}
