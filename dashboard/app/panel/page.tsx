import type { Metadata } from 'next';
import { Panel, type PanelAnchor } from '@/components/panel/Panel';
import { SiteNav } from '@/components/SiteNav';
import { getGovernanceData } from '@/lib/governance';
import { getDashboardData } from '@/lib/soroban';

// Reached by its URL only: not linked from the site, not indexed. That is
// not what protects it: every action is signed in the visitor's wallet, and
// the contracts decide who may do what.
export const metadata: Metadata = {
  title: 'Panel: Mona',
  robots: { index: false, follow: false },
};

export const revalidate = 30;

export default async function PanelPage() {
  const [dashboard, governance] = await Promise.all([
    getDashboardData(),
    getGovernanceData().catch((err: Error) => ({ error: err.message.split('\n')[0] })),
  ]);
  // Only what the panel shows; the score history stays on the server.
  const anchors: PanelAnchor[] = dashboard.anchors.map((a) => ({
    anchorId: a.anchorId,
    name: a.name,
    domain: a.domain,
    sourceType: a.sourceType,
    operator: a.operator,
    stake: a.stake,
    ...(a.claim ? { claim: a.claim } : {}),
    ...(a.withdrawal ? { withdrawal: a.withdrawal } : {}),
    ...(a.card ? { cardWindowEnd: a.card.windowEnd, cardScore: a.card.score } : {}),
    ...(a.dispute ? { dispute: a.dispute } : {}),
    ...(a.deactivated ? { deactivated: a.deactivated } : {}),
  }));

  return (
    <div className="as-grid-ground min-h-screen">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SiteNav />
        <header className="pb-8 pt-10">
          <p className="font-mono text-xs uppercase tracking-widest text-as-signal">Panel</p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-[-0.03em] text-as-ink sm:text-5xl">
            Operators and admins.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-as-ink-muted">
            Connect a wallet. An anchor&apos;s operator manages its stake and disputes its score card; the contracts&apos;
            admin signers see what is waiting to change. Every action is signed in your wallet and checked on-chain.
          </p>
        </header>
        {'error' in governance ? (
          <p className="as-panel px-5 py-4 text-sm text-as-danger">Could not read the contracts: {governance.error}</p>
        ) : (
          <Panel anchors={anchors} governance={governance} />
        )}
        <div className="h-16" />
      </div>
    </div>
  );
}
