import { formatRelativeTime } from '@/lib/format';
import type { TickerItem } from '@/lib/home';

/** The latest checks scrolling past. Ambience only: every reading in it is
 * also on the scores page. The copy is doubled for a seamless loop, and the
 * second copy is hidden from assistive tech. Pauses on hover. */
export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  const row = (copy: number) =>
    items.map((it, i) => (
      <span key={`${copy}-${i}`} className="as-ticker__item" aria-hidden={copy === 1 ? 'true' : undefined}>
        <span className={`as-dot ${it.ok ? 'text-as-score-high' : 'text-as-score-low'}`} />
        <b>{it.name}</b>
        <span>{it.stage}</span>
        {it.ms !== undefined && (
          <span className={it.ok ? 'text-as-score-high' : 'text-as-score-low'}>{it.ok ? `${it.ms.toLocaleString('en-US')} ms` : 'failed'}</span>
        )}
        <span className="as-timestamp">{formatRelativeTime(it.at)}</span>
      </span>
    ));
  return (
    <div className="as-ticker" aria-label="Latest checks">
      <div className="as-ticker__track">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}
