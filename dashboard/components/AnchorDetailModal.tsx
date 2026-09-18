'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatChartAxisLabel, formatRelativeTime, formatStakeXlm } from '@/lib/format';
import { describeHealth, RISK_LABEL, TREND_LABEL } from '@/lib/health';
import type { AnchorViewModel } from '@/lib/types';
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

  const historyTimestamps = anchor.scoreHistory.map((p) => p.timestamp);
  const chartData = anchor.scoreHistory.map((p) => ({
    label: formatChartAxisLabel(p.timestamp, historyTimestamps),
    timestamp: p.timestamp,
    score: p.score,
  }));

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
    >
      <motion.div
        className="glass-panel w-full max-w-2xl rounded-card p-6 shadow-glow"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="anchor-detail-title"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 6 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: 'easeOut' }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 id="anchor-detail-title" className="font-heading text-lg font-semibold text-ink">
              {anchor.name}
            </h2>
            <SourceBadge sourceType={anchor.sourceType} />
            <span className="text-sm text-ink-muted">{anchor.domain}</span>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-ink-muted transition-colors hover:border-border-strong hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {anchor.sourceType === 'RealMainnet' && (
          <div className="mb-5 rounded-card border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-ink-muted">
            Recent transfers for this anchor are currently
            <span className="font-medium text-ink"> read-only </span>
            monitored on mainnet (Horizon, last 7 days). A real SEP-24 transfer
            test against this anchor (like testnet-probe runs against testnet
            anchors) is still under development — a test that moves real
            money on mainnet is deliberately not performed.
          </div>
        )}

        <div className="mb-5 grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-ink-muted">Score</span>
            <ScoreValue score={anchor.score} size={44} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Stake</span>
            <span className="tabular font-heading font-semibold text-ink">{formatStakeXlm(anchor.stake)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Last updated</span>
            <span className="font-medium text-ink">{formatRelativeTime(anchor.lastUpdated)}</span>
          </div>
        </div>

        <div className="h-64 w-full rounded-card border border-border bg-surface-muted/50 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="detail-score-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'rgb(var(--color-ink-muted))' }}
                axisLine={{ stroke: 'rgb(var(--color-border))' }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'rgb(var(--color-ink-muted))' }}
                axisLine={{ stroke: 'rgb(var(--color-border))' }}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgb(var(--color-surface-glass))',
                  border: '1px solid rgb(var(--color-border))',
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'rgb(var(--color-ink))' }}
              />
              {anchor.slashEvents.map((slash) => (
                <ReferenceLine
                  key={slash.timestamp}
                  x={formatChartAxisLabel(slash.timestamp, historyTimestamps)}
                  stroke="rgb(var(--color-danger))"
                  strokeDasharray="4 4"
                  label={{
                    value: 'legacy slash',
                    position: 'top',
                    fontSize: 10,
                    fill: 'rgb(var(--color-danger))',
                  }}
                />
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
                stroke="rgb(var(--color-accent))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {anchor.health && (
          <div className="mt-4 flex flex-col gap-1 text-sm text-ink-muted">
            <span>
              Trend: <span className="font-medium text-ink">{TREND_LABEL[anchor.health.trend]}</span>
              {RISK_LABEL[anchor.health.riskReason] && (
                <>
                  {' · '}
                  <span className="font-medium text-danger">{RISK_LABEL[anchor.health.riskReason]}</span>
                </>
              )}
            </span>
            <span className="tabular">{describeHealth(anchor.health)}</span>
          </div>
        )}

        {anchor.slashEvents.length > 0 && (
          <div className="mt-4 text-sm text-ink-muted">
            <span className="font-medium text-danger">{anchor.slashEvents.length} legacy slashing event{anchor.slashEvents.length === 1 ? '' : 's'}</span>{' '}
            — marked with dashed red lines. They come from an earlier version of the oracle, which slashed stake
            automatically and was triggered here by bugs in our own probe. The oracle now only publishes a score and never
            moves anyone&apos;s stake.
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
