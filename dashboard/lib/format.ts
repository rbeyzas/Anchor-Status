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

export function formatShortDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
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
