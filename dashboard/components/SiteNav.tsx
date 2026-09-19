import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react/dist/ssr';
import { Wordmark } from './Logo';
import { ThemeToggle } from './ThemeToggle';

// `onDark` is for the indigo band: white type and a white primary button.
// `showCta` is off on the scores page, where the CTA would point at itself.
export function SiteNav({ onDark = false, showCta = true }: { onDark?: boolean; showCta?: boolean }) {
  const link = onDark ? 'text-white/75 hover:text-white' : 'text-ink-muted hover:text-ink';
  return (
    <nav className="flex items-center justify-between gap-4 py-6" aria-label="Primary">
      <Link href="/" className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Anchor Status home">
        <Wordmark className={onDark ? 'text-white' : 'text-ink'} dot={onDark ? '#62aef0' : undefined} />
      </Link>
      <div className="flex items-center gap-3 sm:gap-5">
        <Link href="/methodology" className={`text-sm transition-colors ${link}`}>
          How we measure
        </Link>
        <Link href="/#evidence" className={`hidden text-sm transition-colors sm:inline ${link}`}>
          Evidence
        </Link>
        <ThemeToggle onDark={onDark} />
        {showCta && (
          <Link
            href="/scores"
            className={`btn btn-sm ${onDark ? 'btn-white' : 'btn-primary'} focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
          >
            Live scores
            <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  );
}
