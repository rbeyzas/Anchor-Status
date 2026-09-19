import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { formatRelativeTime } from '@/lib/format';
import { shortHash, type ProofChain as Chain } from '@/lib/home';

function Node({ label, children, href }: { label: string; children: React.ReactNode; href?: string }) {
  const body = (
    <>
      <span className="as-label flex items-center justify-between gap-2">
        {label}
        {href && <ArrowUpRight size={13} weight="bold" aria-hidden="true" className="text-as-ink-faint" />}
      </span>
      <div className="mt-3">{children}</div>
    </>
  );
  return (
    <li className="as-flow__node">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="as-panel as-panel--hover block h-full p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
        >
          {body}
        </a>
      ) : (
        <div className="as-panel h-full p-4">{body}</div>
      )}
    </li>
  );
}

/** From one check to the chain, with the real hashes: each link opens the
 * document it names, and the command recomputes the card from the bundle. */
export function ProofChain({ chain, oracleUrl }: { chain: Chain; oracleUrl?: string }) {
  return (
    <div>
      <span className="as-label mb-3 block">{chain.name} · from its latest check to the chain</span>
      <ol className="as-flow as-flow--4">
        <Node label="Check">
          <span className="block text-sm text-as-ink">Probe report</span>
          <span className="as-timestamp">{formatRelativeTime(chain.evidence.at)}</span>
        </Node>
        <Node label="Evidence" href={chain.evidence.url}>
          <span className="as-mono block text-sm text-as-pulse">{shortHash(chain.evidence.hash)}</span>
          <span className="as-timestamp">signed SEP-10 challenge</span>
        </Node>
        <Node label="Inputs bundle" href={chain.bundle.url}>
          <span className="as-mono block text-sm text-as-pulse">{shortHash(chain.bundle.hash)}</span>
          <span className="as-timestamp">30 days of checks</span>
        </Node>
        <Node label="On-chain card" href={oracleUrl}>
          <span className="as-mono block text-sm text-as-ink">score {chain.card.score}</span>
          <span className="as-timestamp">published {formatRelativeTime(chain.card.publishedAt)}</span>
        </Node>
      </ol>
      <code className="as-code mt-4 block break-all rounded-as-sm bg-as-surface-2 px-3 py-2 text-as-ink-muted">
        cd services/aggregator && npm run verify-score -- <span className="text-as-pulse">{chain.bundle.hash}</span> --anchor {chain.anchorId}
      </code>
    </div>
  );
}
