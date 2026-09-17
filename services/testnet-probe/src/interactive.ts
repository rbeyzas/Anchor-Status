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
 * Past failures against testanchor.stellar.org were probe bugs, not bot
 * mitigation: headless Chromium renders the form in ~2s. The flow stalled
 * because the name/surname inputs (no `type` attribute) were never filled,
 * the Submit locator hit the icon-only dark-mode toggle, and the fresh
 * account had no trustline to receive the deposit (see trustline.ts).
 *
 * Returns false if no input ever rendered or nothing could be filled or
 * clicked. The probe records that as inconclusive rather than blaming the
 * anchor. This function deliberately does no headless-detection evasion.
 */
export async function completeInteractiveFlow(
  url: string,
  amount: string,
  timeoutMs: number,
  headless = true,
): Promise<boolean> {
  const browser = await chromium.launch({
    headless,
    executablePath: preinstalledChromiumPath(),
  });
  try {
    const page = await browser.newPage();
    const deadline = Date.now() + timeoutMs;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // The reference UI is a client-rendered SPA: at domcontentloaded the form
    // isn't there yet, so the first pass found nothing and the loop exited.
    await page
      .locator('input:visible')
      .first()
      .waitFor({ timeout: Math.max(0, deadline - Date.now()) })
      .catch(() => undefined);

    let interacted = false;
    while (Date.now() < deadline && !page.isClosed()) {
      const filledSomething = await tryFillAndSubmit(page, amount);
      if (!filledSomething) {
        break;
      }
      interacted = true;
      await page.waitForTimeout(1000);
    }
    return interacted;
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
  // this, so match email/tel too. Its name/surname inputs carry no `type`
  // attribute at all (implicitly text), so `input[type="text"]` misses them.
  const textInputs = page.locator(
    'input:is([type="text"], :not([type])):not([name*="amount" i]), input[type="email"], input[type="tel"]',
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

  // Match by accessible name, not `button[type="submit"]`: the reference UI's
  // icon-only dark-mode toggle is also type="submit" and comes first in the
  // DOM, so a type-based `.first()` toggled the theme on every pass and the
  // real Submit was never clicked.
  const submitButton = page.getByRole('button', { name: /^\s*(submit|continue|confirm)\s*$/i }).first();
  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click().catch(() => undefined);
    didSomething = true;
  }

  return didSomething;
}
