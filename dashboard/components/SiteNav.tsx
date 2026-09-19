'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';
import { Wordmark } from './Logo';
import { StatusChip } from './StatusChip';
import { ThemeToggle } from './ThemeToggle';

// A plain bar on the grid ground, not a panel. `showCta` is off on the
// scores page, where the CTA would point at itself.
export function SiteNav({ showCta = true }: { showCta?: boolean }) {
  const pathname = usePathname();
  const linkClass = (href: string) =>
    `text-sm transition-colors ${pathname === href ? 'text-as-ink' : 'text-as-ink-muted hover:text-as-ink'}`;
  return (
    <nav className="flex items-center justify-between gap-4 py-6" aria-label="Primary">
      <Link
        href="/"
        className="rounded text-as-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
        aria-label="Anchor Status home"
      >
        <Wordmark />
      </Link>
      <div className="flex items-center gap-3 sm:gap-5">
        <Link href="/methodology" className={linkClass('/methodology')} aria-current={pathname === '/methodology' ? 'page' : undefined}>
          How we measure
        </Link>
        <Link href="/#evidence" className="hidden text-sm text-as-ink-muted transition-colors hover:text-as-ink sm:inline">
          Evidence
        </Link>
        <StatusChip tone="signal" live>
          Live
        </StatusChip>
        <ThemeToggle />
        {showCta && (
          <Link
            href="/scores"
            className="as-btn as-btn--primary as-btn--sm focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
          >
            Live scores
            <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  );
}
