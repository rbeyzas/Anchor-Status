import { formatRelativeTime } from '@/lib/format';
import type { ProbeExample, StepState } from '@/lib/home';

const STATE: Record<StepState, { cls: string; tone: string; label: string }> = {
  ok: { cls: 'as-probe__step--ok', tone: 'text-as-score-high', label: 'answered' },
  declined: {
    cls: 'as-probe__step--warn',
    tone: 'text-as-score-medium',
    label: 'declined by policy',
  },
  failed: { cls: 'as-probe__step--fail', tone: 'text-as-score-low', label: 'failed' },
  not_run: { cls: '', tone: 'text-as-ink-faint', label: 'not reached' },
  not_advertised: { cls: '', tone: 'text-as-ink-faint', label: 'not offered' },
};

export function ProbeTimeline({ example }: { example: ProbeExample }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="as-label">
          {example.name} · {example.domain}
        </span>
        <span className="as-timestamp">
          checked {formatRelativeTime(example.at)}
          {example.seconds !== undefined ? ` · ${example.seconds.toFixed(2)} s in total` : ''}
        </span>
      </div>
      <ol className="as-probe">
        {example.steps.map((s, i) => {
          const st = STATE[s.state];
          return (
            <li key={s.stage} className={`as-panel as-probe__step ${st.cls}`}>
              <span className="as-label">Step {i + 1}</span>
              <span className="as-probe__title">{s.title}</span>
              <div className="as-probe__meta">
                <span className={`as-probe__ms ${st.tone}`}>
                  {s.ms !== undefined ? (
                    <>
                      {s.ms.toLocaleString('en-US')}
                      <small>ms</small>
                    </>
                  ) : (
                    '-'
                  )}
                </span>
                <span className={`as-timestamp ${st.tone}`}>{st.label}</span>
              </div>
              <span className="as-probe__code" title={s.request}>
                {s.request}
              </span>
            </li>
          );
        })}
        <span className="as-probe__cursor" aria-hidden="true" />
      </ol>
    </div>
  );
}
