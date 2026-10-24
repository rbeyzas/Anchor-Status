const XLM_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatStakeXlm(stake: number): string {
  return `${XLM_FORMATTER.format(Math.round(stake))} XLM`;
}

export function stroopsToXlm(stroops: number | bigint): number {
  const n = typeof stroops === 'bigint' ? Number(stroops) : stroops;
  return n / 10_000_000;
}

/** Typed XLM ("12", "0.5") to stroops, without floating point; null for
 * anything that is not a positive amount with at most 7 decimals. */
export function xlmToStroops(text: string): bigint | null {
  const m = /^\s*(\d+)(?:\.(\d{1,7}))?\s*$/.exec(text);
  if (!m) return null;
  const stroops = BigInt(m[1]) * 10_000_000n + BigInt((m[2] ?? '').padEnd(7, '0'));
  return stroops > 0n ? stroops : null;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatShortDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
}

/** Formats a chart axis label as time-of-day (HH:mm) instead of a bare date
 * when every point falls on the same calendar day — a same-day date label
 * repeated across every tick reads as a single frozen data point rather
 * than a time series, so time-of-day resolution is used instead. */
export function formatChartAxisLabel(iso: string, allTimestamps: string[]): string {
  const dates = allTimestamps.map((t) => new Date(t));
  const sameDay = dates.every(
    (d) => d.toDateString() === dates[0].toDateString(),
  );
  return sameDay ? TIME_FORMATTER.format(new Date(iso)) : DATE_FORMATTER.format(new Date(iso));
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  // Ahead of now (a time lock, a cooldown): "in 3h".
  if (diffMs < -60_000) return `in ${formatRelativeTime(now.toISOString(), new Date(now.getTime() - diffMs)).replace(' ago', '')}`;
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

const SOURCE_LABELS: Record<string, string> = {
  RealMainnet: 'Live mainnet',
  RealTestnet: 'Live testnet',
  SimulatedMock: 'Simulated',
};

export function sourceLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] ?? sourceType;
}
