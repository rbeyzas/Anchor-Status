const XLM_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatStakeXlm(stake: number): string {
  return `${XLM_FORMATTER.format(Math.round(stake))} XLM`;
}

export function stroopsToXlm(stroops: number | bigint): number {
  const n = typeof stroops === 'bigint' ? Number(stroops) : stroops;
  return n / 10_000_000;
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
