import type { Metadata } from 'next';
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { Logo } from '@/components/Logo';
import { SiteNav } from '@/components/SiteNav';

export const metadata: Metadata = {
  title: 'Project structure: Mona',
  description: 'An interactive map of the Mona codebase: contracts, collectors, aggregator and dashboard, and how they connect.',
};

const GRAPH_SRC = '/structure/graph.html';

export default function StructurePage() {
  return (
    <div className="as-grid-ground min-h-screen">
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <SiteNav />
      <header className="pb-8 pt-10">
        <p className="font-mono text-xs uppercase tracking-widest text-as-signal">Project structure</p>
        <h1 className="mt-3 max-w-3xl font-heading text-5xl font-bold leading-[1.02] tracking-[-0.033em] text-as-ink sm:text-6xl">
          How the code fits together.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-as-ink-muted">
          Every function, type and file in the repository as a node, every import, call and containment as an edge, grouped
          into communities. Click a node to see its neighbors, search by name, or switch a community off in the legend.
        </p>
      </header>

      <div className="overflow-hidden rounded-as-md border border-as-hairline bg-as-surface-1 shadow-as-panel">
        <iframe
          src={GRAPH_SRC}
          title="Interactive graph of the Mona codebase"
          loading="lazy"
          className="block h-[70vh] min-h-[480px] w-full border-0"
        />
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-as-ink-faint">
        <span>Generated from the repository with graphify, so it reflects the code, not a hand-drawn diagram.</span>
        <a
          href={GRAPH_SRC}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-as-ink-muted transition-colors hover:text-as-ink"
        >
          Open full screen <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </p>

      <footer className="mt-10 flex items-center gap-2 py-8 text-sm font-medium text-as-ink">
        <Logo size={18} /> Mona
      </footer>
    </div>
    </div>
  );
}
