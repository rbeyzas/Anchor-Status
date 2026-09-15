'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from '@phosphor-icons/react';

export function ThemeToggle() {
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
      className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface-glass/60 text-ink-muted transition-colors hover:border-border-strong hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
