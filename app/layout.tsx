import type { Metadata, Viewport } from 'next';
import './globals.css';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Undercover: Tebak Kata',
  description: 'Game tebak kata Undercover untuk dimainkan bergiliran dalam satu HP. Tanpa login, tanpa server.',
  manifest: `${BASE}/manifest.webmanifest`,
  icons: { icon: `${BASE}/icon.svg`, apple: `${BASE}/icon.svg` },
  appleWebApp: { capable: true, title: 'Undercover', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#120e22',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
