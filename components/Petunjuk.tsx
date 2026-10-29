'use client';

// Komponen petunjuk ketik: form giliran (kirim petunjuk / sudah bicara) dan riwayat petunjuk per pemain atau per ronde.
// Semua teks dirender sebagai teks React biasa (otomatis di-escape).
import { useState, type FormEvent } from 'react';
import { MAKS_PETUNJUK, type EntriPetunjuk } from '@/lib/petunjuk';
import type { Peran } from '@/lib/types';
import { NAMA_PERAN } from './ui';

export function FormPetunjuk({ judul, galat, onKirim, onSudahBicara, onUbah }: {
  judul: string;
  galat: string | null;
  onKirim: (teks: string) => void;
  onSudahBicara: () => void;
  /** Dipanggil saat teks berubah (mis. untuk menghapus galat lama). */
  onUbah?: () => void;
}) {
  const [teks, setTeks] = useState('');
  const sisa = MAKS_PETUNJUK - Array.from(teks).length;
  const kirim = (e: FormEvent) => {
    e.preventDefault();
    if (teks.trim()) onKirim(teks.trim());
  };
  return (
    <form className="kartu sorot form-petunjuk muncul" onSubmit={kirim}>
      <h2>{judul}</h2>
      <p className="catatan">Satu petunjuk tanpa menyebut katamu.</p>
      <input
        value={teks}
        onChange={(e) => {
          setTeks(Array.from(e.target.value).slice(0, MAKS_PETUNJUK).join(''));
          onUbah?.();
        }}
        placeholder="Petunjuk"
        aria-label="Petunjuk"
        aria-invalid={!!galat}
        aria-describedby="info-petunjuk"
        autoComplete="off"
        autoCapitalize="off"
        enterKeyHint="send"
        autoFocus
      />
      <p id="info-petunjuk" className={galat ? 'galat-petunjuk' : 'catatan nol'} role={galat ? 'alert' : undefined}>
        {galat ?? `Maks ${MAKS_PETUNJUK} karakter${sisa <= 10 ? `, sisa ${sisa}` : ''}`}
      </p>
      <div className="baris-petunjuk">
        <button type="submit" className="utama" disabled={!teks.trim()}>Kirim</button>
        <button type="button" className="kedua" onClick={onSudahBicara}>Sudah bicara</button>
      </div>
    </form>
  );
}

export interface PemainRiwayat {
  kunci: string;
  nama: string;
  hidup: boolean;
  /** Peran yang sudah terbuka (tereliminasi atau game selesai). */
  peran?: Peran;
  saya?: boolean;
}

export function RiwayatPetunjuk({ pemain, entri, giliran, ronde }: {
  pemain: PemainRiwayat[];
  entri: EntriPetunjuk[];
  /** Kunci pemain yang sedang giliran mengetik (untuk penanda). */
  giliran?: string | null;
  ronde: number;
}) {
  const [mode, setMode] = useState<'pemain' | 'ronde'>('pemain');
  const nama = (k: string) => pemain.find((p) => p.kunci === k)?.nama ?? '?';
  const daftarRonde = Array.from(new Set([...entri.map((e) => e.ronde), ronde])).sort((a, b) => a - b);
  return (
    <section className="kartu riwayat-petunjuk" aria-labelledby="judul-riwayat">
      <div className="baris-judul">
        <h2 id="judul-riwayat">Riwayat</h2>
        <div className="chip-grup kecil-tombol" role="group" aria-label="Tampilan riwayat">
          <button type="button" className={`chip ${mode === 'pemain' ? 'pilih' : ''}`} aria-pressed={mode === 'pemain'} onClick={() => setMode('pemain')}>Pemain</button>
          <button type="button" className={`chip ${mode === 'ronde' ? 'pilih' : ''}`} aria-pressed={mode === 'ronde'} onClick={() => setMode('ronde')}>Ronde</button>
        </div>
      </div>
      {mode === 'pemain' ? (
        <ul className="riwayat-daftar">
          {pemain.map((p) => {
            const milik = entri.filter((e) => e.pemain === p.kunci);
            return (
              <li key={p.kunci} className={`${p.hidup ? '' : 'mati'} ${giliran === p.kunci ? 'sekarang' : ''}`}>
                <div className="riwayat-kepala">
                  <span className="riwayat-nama">{p.nama}{p.saya && <em> (kamu)</em>}</span>
                  {!p.hidup && <span className="lencana off">Tereliminasi</span>}
                  {p.peran && <span className={`lencana ${p.peran}`}>{NAMA_PERAN[p.peran]}</span>}
                  {giliran === p.kunci && <span className="lencana host">Mengetik</span>}
                </div>
                {milik.length === 0 ? (
                  <p className="riwayat-kosong">Belum ada petunjuk.</p>
                ) : (
                  <ul className="riwayat-petunjuk-list">
                    {milik.map((e) => (
                      <li key={`${e.ronde}-${e.waktu}`} className="petunjuk-chip">
                        <span className="petunjuk-ronde">R{e.ronde}</span> {e.teks}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ol className="riwayat-daftar">
          {daftarRonde.map((r) => {
            const isi = entri.filter((e) => e.ronde === r);
            return (
              <li key={r}>
                <div className="riwayat-kepala"><span className="riwayat-nama">Ronde {r}</span></div>
                {isi.length === 0 ? (
                  <p className="riwayat-kosong">Belum ada petunjuk.</p>
                ) : (
                  <ul className="riwayat-petunjuk-list">
                    {isi.map((e) => (
                      <li key={`${e.pemain}-${e.waktu}`} className="petunjuk-chip">
                        <span className="petunjuk-ronde">{nama(e.pemain)}</span> {e.teks}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
