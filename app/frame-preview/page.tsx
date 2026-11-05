'use client';

// Halaman QA: contoh frame tiap kategori × tingkat (tidak tertaut dari menu).
import { BingkaiAvatar } from '@/components/Gelar';
import { META_KATEGORI, KATEGORI_MUSIM, type KategoriMusim } from '@/lib/peringkatMusim';
import type { SlotMusimApi } from '@/lib/supabase/peringkatMusim';

function slot(kategori: KategoriMusim, peringkat: 1 | 2 | 3): SlotMusimApi {
  return { kategori, peringkat, main: 20, menang: 15, metrik: 15 };
}

function AvatarDummy({ nama, ukuran }: { nama: string; ukuran: number }) {
  return (
    <span
      className="avatar"
      aria-hidden
      style={{
        width: ukuran,
        height: ukuran,
        fontSize: Math.round(ukuran * 0.4),
        background: '#3a3a3a',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        fontWeight: 800,
      }}
    >
      {nama.slice(0, 2).toUpperCase()}
    </span>
  );
}

export default function FramePreview() {
  return (
    <main style={{ padding: 16, maxWidth: 390, margin: '0 auto', background: '#0b0b0b', minHeight: '100dvh', color: '#eee' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 12px' }}>Preview frame gelar</h1>
      {KATEGORI_MUSIM.map((k) => (
        <section key={k} style={{ marginBottom: 20 }} data-kat={k}>
          <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>{META_KATEGORI[k].ikon} {META_KATEGORI[k].nama}</h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {([1, 2, 3] as const).map((p) => {
              const sz = p === 1 ? 56 : p === 2 ? 40 : 28;
              return (
                <div key={p} style={{ textAlign: 'center' }}>
                  <BingkaiAvatar
                    slot={slot(k, p)}
                    ukuran={sz}
                    anak={<AvatarDummy nama={`${k}${p}`} ukuran={sz} />}
                  />
                  <div style={{ fontSize: 11, marginTop: 6, color: '#aaa' }}>#{p}</div>
                </div>
              );
            })}
          </div>
          <ul className="daftar-petunjuk" style={{ marginTop: 10 }}>
            <li className={`sekarang gelar-${META_KATEGORI[k].warna} gelar-p1`}>
              <span className="nomor">1</span>
              <span className="dp-nama">Giliran #{META_KATEGORI[k].labelSingkat}</span>
            </li>
          </ul>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li className={`chat-pesan gelar-${META_KATEGORI[k].warna} gelar-p1`}>
              <div className="chat-meta"><span className="chat-nama">Pemain {META_KATEGORI[k].labelSingkat}</span></div>
              <div>Bubble chat contoh</div>
            </li>
          </ul>
        </section>
      ))}
    </main>
  );
}
