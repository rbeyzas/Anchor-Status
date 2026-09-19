import type { Metadata } from 'next';
import { Geist_Mono, Space_Grotesk } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

// One family carries display, body and UI: Space Grotesk (design-system
// v2's console language). Tight negative tracking at display sizes is
// applied where it is used.
const sans = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Anchor Status: which anchor will hold?',
  description:
    'Stellar SEP-24 anchor reliability, from live mainnet, live testnet, and simulated sources.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-body antialiased">
        <ThemeProvider>
          <div className="bg-field" aria-hidden="true" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
