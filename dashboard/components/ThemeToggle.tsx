'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from '@phosphor-icons/react';

export function ThemeToggle({ onDark = false }: { onDark?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid rendering theme-dependent icon until after mount, since the
  // server can't know the persisted preference.
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`${onDark ? 'border-white/30 text-white hover:bg-white/10' : 'border-border-strong text-ink hover:bg-surface-muted'} flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      {mounted &&
        (isDark ? (
          <Sun size={16} weight="bold" aria-hidden="true" />
        ) : (
          <Moon size={16} weight="bold" aria-hidden="true" />
        ))}
    </button>
  );
}
