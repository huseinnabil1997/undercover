'use client';

import dynamic from 'next/dynamic';

// Game sepenuhnya berjalan di browser (state React + localStorage), jadi tidak dirender di server.
const UndercoverGame = dynamic(() => import('@/components/UndercoverGame'), {
  ssr: false,
  loading: () => (
    <main className="wadah">
      <p className="muat">Memuat game...</p>
    </main>
  ),
});

export default function Halaman() {
  return <UndercoverGame />;
}
