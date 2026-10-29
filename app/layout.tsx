import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';

// Font gratis mirip tipografi Spotify. next/font mengunduhnya saat build dan menyajikannya dari situs ini sendiri.
const figtree = Figtree({ subsets: ['latin'], weight: ['400', '500', '700', '800'], display: 'swap', variable: '--font-figtree' });

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Undercover: Tebak Kata',
  description: 'Game tebak kata Undercover: main online dengan HP masing-masing atau bergiliran dalam satu HP. Tanpa login, tanpa server game.',
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${BASE}/favicon.ico`, sizes: '16x16 32x32 48x48' },
      { url: `${BASE}/icon.svg`, type: 'image/svg+xml' },
    ],
    apple: { url: `${BASE}/apple-touch-icon.png`, sizes: '180x180' },
  },
  appleWebApp: { capable: true, title: 'Undercover', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#121212',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
