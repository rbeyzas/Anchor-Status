'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatChartAxisLabel, formatRelativeTime, formatStakeXlm } from '@/lib/format';
import { describeHealth, RISK_LABEL, TREND_LABEL } from '@/lib/health';
import { CONFIDENCE_LABEL, confidenceBand, isWithheld } from '@/lib/scorecard';
import { evidenceUrl, hasEnoughData, headlineScore, latestEvidence, listingExplanation } from '@/lib/status-labels';
import type { AnchorViewModel } from '@/lib/types';
import { PillarRadar } from './PillarRadar';
import { ConfidenceChip, FlagChips, PillarBars } from './ScoreCardParts';
import { ScoreValue } from './ScoreValue';
import { SourceBadge } from './SourceBadge';

export function AnchorDetailModal({
  anchor,
  onClose,
}: {
  anchor: AnchorViewModel;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const evidence = latestEvidence(anchor);
  const card = anchor.card;
  const context = anchor.cardContext;
  const score = headlineScore(anchor);
  const historyTimestamps = anchor.scoreHistory.map((p) => p.timestamp);
  const chartData = anchor.scoreHistory.map((p) => ({
    label: formatChartAxisLabel(p.timestamp, historyTimestamps),
    timestamp: p.timestamp,
    score: p.score,
  }));

  const slashesAt = new Map<string, typeof anchor.slashEvents>();
  for (const slash of anchor.slashEvents) {
    const x = formatChartAxisLabel(slash.timestamp, historyTimestamps);
    slashesAt.set(x, [...(slashesAt.get(x) ?? []), slash]);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
    >
      <motion.div
        className="as-panel h-full w-full max-w-2xl overflow-y-auto p-6 shadow-glow sm:rounded-l-card sm:p-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="anchor-detail-title"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: 'easeOut' }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 id="anchor-detail-title" className="font-heading text-lg font-semibold text-as-ink">
              {anchor.name}
            </h2>
            <SourceBadge sourceType={anchor.sourceType} />
            <span className="text-sm text-as-ink-muted">{anchor.domain}</span>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-as-hairline text-as-ink-muted transition-colors hover:border-as-border-control hover:text-as-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-as-pulse"
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {anchor.sourceType === 'RealMainnet' && (
          <div className="mb-5 rounded-as-md border border-as-signal/30 bg-as-signal-soft px-4 py-3 text-sm text-as-ink-muted">
            Every 20 minutes we check this anchor&apos;s live mainnet API the way a
            wallet would: its stellar.toml, its transfer server, and a SEP-10
            sign-in, then we start a deposit and
            <span className="font-medium text-as-ink"> abandon it before any money moves</span>.
            The score reflects whether that works and how fast, not how much
            traffic the anchor has. An anchor that only serves registered
            wallets still counts as reachable.
          </div>
        )}

        {anchor.sourceType === 'RealTestnet' && (
          <div className="mb-5 rounded-as-md border border-as-pulse/30 bg-as-pulse-soft px-4 py-3 text-sm text-as-ink-muted">
            This anchor gets the same check as every mainnet anchor: its stellar.toml, its transfer server, and a SEP-10
            sign-in. On testnet we then go further and
            <span className="font-medium text-as-ink"> complete a real deposit</span>, funded through Friendbot, and check
            every payment on the ledger. The score card below is computed exactly as on mainnet.
          </div>
        )}

        <div className="mb-5 grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-as-ink-muted">Score</span>
            {anchor.status?.aliasOf ? (
              <span className="text-sm text-as-ink-faint">Scored as {anchor.status.aliasOf.domain}</span>
            ) : hasEnoughData(anchor) ? (
              <>
                <ScoreValue score={score} size={44} />
                {card && <ConfidenceChip confidence={card.confidence} />}
              </>
            ) : card ? (
              <span className="text-sm text-as-ink-faint">
                {CONFIDENCE_LABEL[confidenceBand(card.confidence)]} yet (confidence {card.confidence} of the 40 needed)
              </span>
            ) : anchor.sourceType !== 'SimulatedMock' ? (
              <span className="text-sm text-as-ink-faint">Not enough data yet: no score card published</span>
            ) : (
              <span className="text-sm text-as-ink-faint">
                Not enough checks yet ({anchor.health?.observations ?? 0} of 3)
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-as-ink-muted">Checks behind the score</span>
            <span className="tabular font-heading font-semibold text-as-ink">
              {anchor.health ? anchor.health.observations : '-'}
            </span>
            {anchor.stake > 0 && (
              <span className="tabular text-xs text-as-ink-muted">{formatStakeXlm(anchor.stake)} staked</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-as-ink-muted">Last updated</span>
            <span className="font-medium text-as-ink">{formatRelativeTime(anchor.lastUpdated)}</span>
          </div>
        </div>

        {anchor.status?.aliasOf && (
          <p className="mb-5 rounded-as-md border border-as-hairline px-4 py-3 text-sm text-as-ink-muted">
            This domain&apos;s stellar.toml names the same transfer server and signing key as{' '}
            <span className="font-medium text-as-ink">{anchor.status.aliasOf.domain}</span>: one operator. It is measured
            and scored once, under that entry, so that it is not counted twice. It stays on the list, and is still
            checked every few hours in case that ever changes.
          </p>
        )}

        {card && !anchor.status?.aliasOf && (
          <div className="mb-5 rounded-as-md border border-as-hairline px-4 py-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-as-ink">Score card</span>
              <span className="text-xs text-as-ink-faint">
                methodology v{card.methodologyVersion} · 30 days to {formatRelativeTime(card.windowEnd)}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
              <PillarRadar card={card} marketNa={context?.marketNa} />
              <PillarBars card={card} marketNa={context?.marketNa} />
            </div>
            {card.flags.length > 0 && (
              <div className="mt-4">
                <FlagChips flags={card.flags} />
              </div>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
              <div className="flex flex-col gap-0.5">
                <dt className="text-as-ink-faint">Confidence</dt>
                <dd className="tabular font-medium text-as-ink">{card.confidence} / 100</dd>
              </div>
              {context && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-as-ink-faint">Monitored</dt>
                    <dd className="tabular font-medium text-as-ink">
                      {context.monitoredDays < 1 ? 'under a day' : `${Math.floor(context.monitoredDays)} day${Math.floor(context.monitoredDays) === 1 ? '' : 's'}`},{' '}
                      {context.checks30d} checks
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-as-ink-faint">Test depth</dt>
                    <dd className="tabular font-medium text-as-ink">
                      {context.coverage === null ? 'not measured yet' : `${Math.round(context.coverage * 100)}% of its steps`}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {context?.excluded?.length ? (
              <p className="mt-3 text-xs text-as-ink-muted">
                {context.excluded.reduce((n, e) => n + e.probes, 0)} check
                {context.excluded.reduce((n, e) => n + e.probes, 0) === 1 ? '' : 's'} in this window were dropped: our
                collector failed to reach anything those rounds, so they say nothing about this anchor.{' '}
                <Link href="/methodology#incidents" className="font-medium text-as-signal underline">
                  What went wrong
                </Link>
                .
              </p>
            ) : null}
            {anchor.status?.onChainSince && (
              <p className="mt-3 text-xs text-as-ink-muted">
                Issues {anchor.status.issuedAssets?.join(', ')} on-chain since{' '}
                {new Date(anchor.status.onChainSince).toISOString().slice(0, 10)} (context only: age is not scored).
              </p>
            )}
            {anchor.sourceType === 'SimulatedMock' ? (
              <p className="mt-3 text-xs text-as-ink-muted">
                Fixed demo data: this card is not published on-chain and has no inputs bundle to recompute.
              </p>
            ) : (
              <p className="mt-3 text-xs text-as-ink-muted">
                Computed from a published{' '}
                <a href={evidenceUrl(card.inputsHash)} target="_blank" rel="noreferrer" className="font-medium text-as-signal underline">
                  inputs bundle
                </a>{' '}
                whose hash is on-chain. Recompute it yourself:
                <code className="mt-1.5 block overflow-x-auto rounded bg-as-surface-2 px-2 py-1 font-mono text-[11px] text-as-ink">
                  cd services/aggregator && npm run verify-score -- {card.inputsHash} --anchor {anchor.anchorId}
                </code>
              </p>
            )}
          </div>
        )}

        {card && isWithheld(card) ? (
          <p className="flex h-24 w-full items-center justify-center rounded-as-md border border-as-hairline bg-as-surface-2/50 px-4 text-center text-sm text-as-ink-faint">
            The score history appears once there is enough data to show the score itself.
          </p>
        ) : (
          <div className="h-64 w-full rounded-as-md border border-as-hairline bg-as-surface-2/50 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="detail-score-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--as-signal))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="rgb(var(--as-signal))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--as-hairline))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'rgb(var(--as-ink-muted))' }}
                  axisLine={{ stroke: 'rgb(var(--as-hairline))' }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'rgb(var(--as-ink-muted))' }}
                  axisLine={{ stroke: 'rgb(var(--as-hairline))' }}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgb(var(--as-surface-1))',
                    border: '1px solid rgb(var(--as-hairline))',
                    borderRadius: 10,
                    fontSize: 12,
                    // Recharts' default is nowrap, which runs a long slash list off the panel.
                    whiteSpace: 'normal',
                    maxWidth: 240,
                  }}
                  labelStyle={{ color: 'rgb(var(--as-ink))' }}
                  formatter={(value, name) => [value, name === 'score' ? 'Score' : name]}
                  labelFormatter={(label) => {
                    const slashes = slashesAt.get(String(label));
                    return slashes ? (
                      <>
                        {label}
                        <span className="mt-1 block font-medium text-as-danger">
                          {slashes.length} legacy slash{slashes.length === 1 ? '' : 'es'}
                        </span>
                        {slashes.slice(0, 4).map((sl) => (
                          <span key={sl.timestamp} className="tabular block text-as-ink-muted">
                            {formatStakeXlm(sl.amount)} at {new Date(sl.timestamp).toISOString().slice(11, 16)} UTC
                          </span>
                        ))}
                        {slashes.length > 4 && <span className="block text-as-ink-muted">and {slashes.length - 4} more</span>}
                      </>
                    ) : (
                      label
                    );
                  }}
                />
                {/* One bare line per axis position: slashes can come minutes apart, and a
                    label on each one printed over the others. The text below explains them. */}
                {[...new Set(anchor.slashEvents.map((slash) => formatChartAxisLabel(slash.timestamp, historyTimestamps)))].map((x) => (
                  <ReferenceLine key={x} x={x} stroke="rgb(var(--as-danger))" strokeDasharray="4 4" strokeOpacity={0.7} />
                ))}
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="none"
                  fill="url(#detail-score-gradient)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="rgb(var(--as-signal))"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {anchor.status && (
          <div className="mt-4 flex flex-col gap-1 text-sm text-as-ink-muted">
            {anchor.status.checkedAt && (
              <span>
                Latest check {formatRelativeTime(anchor.status.checkedAt)}:{' '}
                {anchor.status.reachable === undefined ? (
                  <span className="font-medium text-as-ink">inconclusive (our side)</span>
                ) : anchor.status.reachable ? (
                  <span className="font-medium text-as-signal">API answering</span>
                ) : (
                  <span className="font-medium text-as-danger">{anchor.status.problem}</span>
                )}
                {anchor.status.policyNote && ` · ${anchor.status.policyNote}`}
                {anchor.status.dormant && ' · silent for a week, so checked every 6 hours'}
              </span>
            )}
            {listingExplanation(anchor) && <span>{listingExplanation(anchor)}</span>}
          </div>
        )}

        {anchor.health && (
          <div className="mt-4 flex flex-col gap-1 text-sm text-as-ink-muted">
            <span>
              Trend: <span className="font-medium text-as-ink">{TREND_LABEL[anchor.health.trend]}</span>
              {RISK_LABEL[anchor.health.riskReason] && (
                <>
                  {' · '}
                  <span className="font-medium text-as-danger">{RISK_LABEL[anchor.health.riskReason]}</span>
                </>
              )}
            </span>
            <span className="tabular">{describeHealth(anchor.health)}</span>
          </div>
        )}

        {evidence && (
          <div className="mt-4 rounded-as-md border border-as-hairline px-4 py-3 text-sm text-as-ink-muted">
            <span className="font-medium text-as-ink">Don&apos;t take our word for it.</span> The latest report (
            {formatRelativeTime(evidence.timestamp)}) was published on-chain with the hash of its{' '}
            <a href={evidence.url} target="_blank" rel="noreferrer" className="font-medium text-as-signal underline">
              evidence
            </a>
            : the anchor&apos;s own signed SEP-10 challenge and, for testnet deposits, the payout transaction on the
            ledger. Check it independently:
            <code className="mt-2 block overflow-x-auto rounded bg-as-surface-2 px-2 py-1 font-mono text-xs text-as-ink">
              cd services/mainnet-probe && npm run verify -- {evidence.hash}
            </code>
          </div>
        )}

        {anchor.slashEvents.length > 0 && (
          <div className="mt-4 text-sm text-as-ink-muted">
            <span className="font-medium text-as-danger">{anchor.slashEvents.length} legacy slashing event{anchor.slashEvents.length === 1 ? '' : 's'}</span>{' '}
            Marked with dashed red lines. They come from an earlier version of the oracle, which slashed stake
            automatically and was triggered here by bugs in our own probe. The oracle now only publishes a score and never
            moves anyone&apos;s stake.
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
