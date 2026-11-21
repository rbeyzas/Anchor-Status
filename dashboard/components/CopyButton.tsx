'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from '@phosphor-icons/react';

/** Copies `text`; says so for two seconds. */
export function CopyButton({ text, children, className = 'as-btn as-btn--primary' }: { text: string; children: ReactNode; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  }
  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {state === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed: select the text below' : children}
    </button>
  );
}
