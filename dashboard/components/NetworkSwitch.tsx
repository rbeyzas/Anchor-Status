import Link from 'next/link';

/** Mainnet and testnet applications are separate queues with separate
 * checks: two pages, and this switch between them. */
export function NetworkSwitch({ current }: { current: 'mainnet' | 'testnet' }) {
  const tab = (network: 'mainnet' | 'testnet', href: string, label: string) => (
    <Link
      href={href}
      aria-current={current === network ? 'page' : undefined}
      className={`as-mono rounded-pill px-4 py-1.5 text-xs font-medium uppercase tracking-[0.08em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse ${
        current === network
          ? network === 'mainnet'
            ? 'bg-as-signal text-as-on-signal'
            : 'bg-as-pulse text-as-on-pulse'
          : 'text-as-ink-muted hover:bg-as-surface-2 hover:text-as-ink'
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Network" className="as-panel inline-flex gap-1 rounded-pill p-1">
      {tab('mainnet', '/apply', 'Mainnet')}
      {tab('testnet', '/apply/testnet', 'Testnet')}
    </nav>
  );
}
