import type { Metadata } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

// One family, as in the reference: Inter carries display, body and UI.
// Tight negative tracking at display sizes is applied where it is used.
const sans = Inter({
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
