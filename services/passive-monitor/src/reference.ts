// Where the reference rate for a peg comes from.
//
// Two sources, in this order:
//
//   1. Reflector's fiat feed, read off the ledger. A reader checking a score
//      card can fetch the same rate from the same contract themselves.
//   2. The HTTP currency table, which nobody can check after the fact.
//
// The rate that was used is recorded on the sample either way, so a card
// always says which of the two it leaned on. Reflector covers 24 currencies;
// the fallback exists because our anchors peg to more than that (GHS, for
// one, is not in the feed).
import { usdPerUnit as fxUsdPerUnit, type FxTable } from './fx.js';
import type { Reflector } from './reflector.js';

export interface Reference {
  rate: number;
  source: string;
  date: string;
}

/**
 * Resolves rates for one round, asking Reflector once per currency and
 * remembering the answer: several anchors peg to the same currency, and the
 * feed only moves every five minutes.
 */
export class ReferenceRates {
  private readonly seen = new Map<string, Reference | undefined>();
  private reflectorFailed = false;

  constructor(
    private readonly fx: FxTable | null,
    private readonly reflector?: Reflector,
  ) {}

  async forCurrency(currency: string): Promise<Reference | undefined> {
    const code = currency.trim().toUpperCase();
    if (this.seen.has(code)) return this.seen.get(code);
    const resolved = await this.resolve(code);
    this.seen.set(code, resolved);
    return resolved;
  }

  private async resolve(code: string): Promise<Reference | undefined> {
    if (this.reflector && !this.reflectorFailed) {
      try {
        const price = await this.reflector.usdPerUnit(code);
        if (price) return { rate: price.price, source: `reflector:${price.feed}`, date: price.at };
      } catch (err) {
        // One outage should not cost the round every rate, and it should not
        // be reported once per currency either.
        this.reflectorFailed = true;
        console.warn(`[passive-monitor] reflector unavailable, using the currency table: ${(err as Error).message}`);
      }
    }
    return fxUsdPerUnit(this.fx, code);
  }

  /** What this round leaned on, for the log. */
  summary(): { reflector: number; table: number; missing: number } {
    let reflector = 0;
    let table = 0;
    let missing = 0;
    for (const r of this.seen.values()) {
      if (!r) missing++;
      else if (r.source.startsWith('reflector:')) reflector++;
      else table++;
    }
    return { reflector, table, missing };
  }
}
