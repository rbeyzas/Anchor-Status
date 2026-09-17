import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { createAndFundAccount } from './friendbot.js';
import { completeInteractiveFlow } from './interactive.js';
import { authenticateSep10 } from './sep10.js';
import { initiateInteractiveDeposit, pollUntilTerminal } from './sep24.js';
import { fetchAnchorToml } from './toml.js';
import { addTrustline } from './trustline.js';
import type { ProbeResult } from './types.js';

export async function runProbe(): Promise<ProbeResult> {
  const startedAt = new Date();
  const startMs = Date.now();

  try {
    console.log(`[testnet-probe] funding a fresh testnet account via ${config.friendbotUrl}`);
    const keypair = await createAndFundAccount(config.friendbotUrl);

    console.log(`[testnet-probe] fetching stellar.toml from ${config.anchorDomain}`);
    const toml = await fetchAnchorToml(config.anchorDomain);

    const currency = toml.currencies.find((c) => c.code === config.assetCode);
    if (!currency) {
      throw new Error(`${config.anchorDomain}'s stellar.toml lists no issuer for ${config.assetCode}`);
    }
    console.log(`[testnet-probe] adding trustline to ${currency.code}:${currency.issuer}`);
    await addTrustline(config.horizonTestnetUrl, keypair, currency.code, currency.issuer, config.networkPassphrase);

    console.log('[testnet-probe] performing SEP-10 authentication');
    const token = await authenticateSep10(toml, keypair, config.networkPassphrase);

    console.log(`[testnet-probe] initiating SEP-24 interactive deposit (${config.assetCode} ${config.depositAmount})`);
    const deposit = await initiateInteractiveDeposit(
      toml.transferServerSep24,
      token,
      config.assetCode,
      config.depositAmount,
    );

    console.log(`[testnet-probe] driving interactive flow at ${deposit.url}`);
    const interacted = await completeInteractiveFlow(deposit.url, config.depositAmount, config.interactiveTimeoutMs, config.headless);
    if (!interacted) {
      // The anchor's API answered SEP-1/10/24 correctly; only our headless
      // browser failed to render its UI. That says nothing about the anchor.
      const settlementSeconds = (Date.now() - startMs) / 1000;
      console.warn('[testnet-probe] interactive form never rendered in headless browser; recording as inconclusive');
      return {
        anchor_id: config.anchorId,
        domain: config.anchorDomain,
        source_type: 'RealTestnet',
        success: false,
        inconclusive: true,
        settlement_seconds: settlementSeconds,
        timestamp: startedAt.toISOString(),
        final_transaction_status: null,
        error: 'interactive UI did not render in headless browser',
      };
    }

    console.log('[testnet-probe] polling transaction status until terminal');
    const finalTx = await pollUntilTerminal(
      toml.transferServerSep24,
      token,
      deposit.id,
      config.pollIntervalMs,
      config.pollTimeoutMs,
    );

    const settlementSeconds = (Date.now() - startMs) / 1000;
    const success = finalTx.status === 'completed';

    const result: ProbeResult = {
      anchor_id: config.anchorId,
      domain: config.anchorDomain,
      source_type: 'RealTestnet',
      success,
      settlement_seconds: settlementSeconds,
      timestamp: startedAt.toISOString(),
      final_transaction_status: finalTx.status,
    };
    console.log(`[testnet-probe] done: ${success ? 'SUCCESS' : 'FAILURE'} in ${settlementSeconds.toFixed(1)}s (status=${finalTx.status})`);
    return result;
  } catch (err) {
    const settlementSeconds = (Date.now() - startMs) / 1000;
    const result: ProbeResult = {
      anchor_id: config.anchorId,
      domain: config.anchorDomain,
      source_type: 'RealTestnet',
      success: false,
      settlement_seconds: settlementSeconds,
      timestamp: startedAt.toISOString(),
      final_transaction_status: null,
      error: (err as Error).message,
    };
    console.error(`[testnet-probe] failed after ${settlementSeconds.toFixed(1)}s: ${result.error}`);
    return result;
  }
}

export function appendResult(result: ProbeResult, resultsPath: string = config.resultsPath): void {
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  let existing: ProbeResult[] = [];
  if (fs.existsSync(resultsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    } catch {
      existing = [];
    }
  }
  existing.push(result);
  fs.writeFileSync(resultsPath, JSON.stringify(existing, null, 2));
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const result = await runProbe();
  appendResult(result);
  process.exitCode = result.success ? 0 : 1;
}
