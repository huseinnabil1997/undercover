'use client';

// Kamus pemain: pasangan kata buatan pemain. Daftar publik bisa dibaca tanpa login; menambah,
// mengubah, dan menghapus pasangan milik sendiri perlu login.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cekPasangan, KATEGORI_BAWAAN, kunciKamus, MAKS_KATA, MAKS_KATEGORI, pesanGalatKamus, rapikanKata, type EntriKamus } from '@/lib/kamusPemain';
import { ambilKamusSaya, hapusKamus, kamusPublik, tambahKamus, ubahKamus, type BarisKamus } from '@/lib/supabase/kamus';
import { Kepala, LayarAkun, useAkun } from './Akun';
import { useDialog } from './Modal';

const MAKS_TAMPIL = 100;

function FormKamus({ awal, ada, onSimpan, onBatal }: {
  awal?: BarisKamus;
  ada: readonly EntriKamus[];
  onSimpan: (a: string, b: string, k: string) => Promise<string | null>;
  onBatal?: () => void;
}) {
  const [a, setA] = useState(awal?.kata_a ?? '');
  const [b, setB] = useState(awal?.kata_b ?? '');
  const [k, setK] = useState(awal?.kategori ?? KATEGORI_BAWAAN);
  const [galat, setGalat] = useState<string | null>(null);
  const [proses, setProses] = useState(false);
  const idp = awal ? `ubah-${awal.id}` : 'baru';
  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    const [x, y, z] = [rapikanKata(a), rapikanKata(b), rapikanKata(k)];
    const g = cekPasangan(x, y, z, ada, awal ? kunciKamus(awal.kata_a, awal.kata_b) : undefined);
    if (g) {
      setGalat(g);
      return;
    }
    setProses(true);
    const hasil = await onSimpan(x, y, z);
    setProses(false);
    setGalat(hasil);
    if (!hasil && !awal) {
      setA('');
      setB('');
    }
  }
  return (
    <form className="kartu form-kamus" onSubmit={kirim} noValidate>
      <h2>{awal ? 'Ubah pasangan' : 'Tambah pasangan'}</h2>
      <label className="label" htmlFor={`${idp}-a`}>Kata Civilian</label>
      <input id={`${idp}-a`} className="isian" value={a} maxLength={MAKS_KATA} placeholder="Contoh: Kopi" onChange={(e) => setA(e.target.value)} />
      <label className="label jarak-atas" htmlFor={`${idp}-b`}>Kata Undercover</label>
      <input id={`${idp}-b`} className="isian" value={b} maxLength={MAKS_KATA} placeholder="Contoh: Teh" onChange={(e) => setB(e.target.value)} />
      <label className="label jarak-atas" htmlFor={`${idp}-k`}>Kategori</label>
      <input id={`${idp}-k`} className="isian" value={k} maxLength={MAKS_KATEGORI} placeholder="Umum" onChange={(e) => setK(e.target.value)} />
      <p className="catatan">Kata mirip tapi berbeda, 2 sampai {MAKS_KATA} karakter. Urutan bisa tertukar saat dimainkan.</p>
      {galat && <p className="galat" role="alert">{galat}</p>}
      <div className="baris-tombol">
        {onBatal && <button type="button" className="kedua" onClick={onBatal}>Batal</button>}
        <button className="utama" type="submit" disabled={proses}>{proses ? 'Menyimpan...' : awal ? 'Simpan' : 'Tambah'}</button>
      </div>
    </form>
  );
}

export function LayarKamus({ onBeranda }: { onBeranda: () => void }) {
  const akun = useAkun();
  const dialog = useDialog();
  const [publik, setPublik] = useState<{ data: EntriKamus[]; dariCache: boolean } | 'galat' | null>(null);
  const [milik, setMilik] = useState<BarisKamus[] | 'galat' | null>(null);
  const [ubah, setUbah] = useState<number | null>(null);
  const [cari, setCari] = useState('');
  const [mintaMasuk, setMintaMasuk] = useState(false);
  const idAkun = akun.status === 'masuk' ? akun.id : null;

  const muatPublik = useCallback((paksa: boolean) => {
    kamusPublik(paksa).then(setPublik, () => setPublik('galat'));
  }, []);
  useEffect(() => {
    let hidup = true;
    kamusPublik(false).then((d) => hidup && setPublik(d), () => hidup && setPublik('galat'));
    return () => {
      hidup = false;
    };
  }, []);
  useEffect(() => {
    if (!idAkun) return;
    let hidup = true;
    ambilKamusSaya(idAkun).then((d) => hidup && setMilik(d), () => hidup && setMilik('galat'));
    return () => {
      hidup = false;
    };
  }, [idAkun]);

  const segarkan = useCallback(async () => {
    muatPublik(true);
    if (idAkun) setMilik(await ambilKamusSaya(idAkun).catch(() => 'galat' as const));
  }, [idAkun, muatPublik]);

  const ada = useMemo(() => (publik && publik !== 'galat' ? publik.data : []), [publik]);
  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return q ? ada.filter((e) => `${e.a} ${e.b} ${e.k}`.toLowerCase().includes(q)) : ada;
  }, [ada, cari]);

  async function simpanBaru(a: string, b: string, k: string): Promise<string | null> {
    try {
      await tambahKamus(a, b, k);
      await segarkan();
      return null;
    } catch (e) {
      return pesanGalatKamus(e as { code?: string; message?: string });
    }
  }

  async function simpanUbah(id: number, a: string, b: string, k: string): Promise<string | null> {
    try {
      await ubahKamus(id, a, b, k);
      setUbah(null);
      await segarkan();
      return null;
    } catch (e) {
      return pesanGalatKamus(e as { code?: string; message?: string });
    }
  }

  async function hapus(r: BarisKamus) {
    const ok = await dialog.konfirmasi({ judul: 'Hapus pasangan?', pesan: `${r.kata_a} dan ${r.kata_b} dihapus dari kamus.`, ok: 'Hapus', batal: 'Batal', bahaya: true });
    if (!ok) return;
    try {
      await hapusKamus(r.id);
      await segarkan();
    } catch (e) {
      void dialog.info({ judul: 'Gagal menghapus', pesan: pesanGalatKamus(e as { code?: string }) });
    }
  }

  if (mintaMasuk && akun.status !== 'masuk') {
    return <LayarAkun alasan="Masuk untuk menambah kata ke kamus pemain." onBeranda={() => setMintaMasuk(false)} />;
  }

  return (
    <main className="wadah">
      <Kepala onBeranda={onBeranda} />
      <section className="tumpuk masuk">
        <div className="kepala-fase"><h2>Kamus pemain</h2></div>
        <p className="catatan tengah-teks nol">Pasangan kata buatan pemain. Otomatis ikut masuk ke sumber Kamus kita dan Internet, di mode Lokal maupun Online. Kategori yang namanya sama digabung, nama baru jadi kategori baru.</p>

        {akun.status === 'masuk' ? (
          <>
            <FormKamus key="baru" ada={ada} onSimpan={simpanBaru} />
            <div className="kartu">
              <h2>Milikku {Array.isArray(milik) && <small>({milik.length})</small>}</h2>
              {milik === null && <p className="catatan" role="status">Memuat...</p>}
              {milik === 'galat' && <p className="galat">Gagal memuat. Periksa internet.</p>}
              {Array.isArray(milik) && milik.length === 0 && <p className="catatan">Belum ada pasangan buatanmu.</p>}
              {Array.isArray(milik) && milik.length > 0 && (
                <ul className="daftar-kamus">
                  {milik.map((r) => ubah === r.id ? (
                    <li key={r.id} className="lebar">
                      <FormKamus awal={r} ada={ada} onSimpan={(a, b, k) => simpanUbah(r.id, a, b, k)} onBatal={() => setUbah(null)} />
                    </li>
                  ) : (
                    <li key={r.id}>
                      <span className="pasangan-kamus"><strong>{r.kata_a}</strong> / <strong>{r.kata_b}</strong><small>{r.kategori}</small></span>
                      <span className="aksi-kamus">
                        <button type="button" className="kecil" aria-label={`Ubah ${r.kata_a} / ${r.kata_b}`} onClick={() => setUbah(r.id)}>Ubah</button>
                        <button type="button" className="kecil bahaya" aria-label={`Hapus ${r.kata_a} / ${r.kata_b}`} onClick={() => void hapus(r)}>Hapus</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : akun.status === 'keluar' ? (
          <div className="kartu">
            <p className="catatan nol">Daftar di bawah bisa dibaca tanpa akun. Untuk menambah, mengubah, atau menghapus pasangan buatanmu, masuk dulu.</p>
            <button className="kedua jarak-atas" onClick={() => setMintaMasuk(true)}>Masuk untuk menambah</button>
          </div>
        ) : null}

        <div className="kartu">
          <div className="baris-judul">
            <h2>Semua pasangan {publik && publik !== 'galat' && <small>({publik.data.length})</small>}</h2>
            <button className="kecil" onClick={() => void segarkan()}>Perbarui</button>
          </div>
          <input className="isian" type="search" aria-label="Cari di kamus" placeholder="Cari kata atau kategori" value={cari} onChange={(e) => setCari(e.target.value)} />
          {publik === null && <p className="catatan" role="status">Memuat...</p>}
          {publik === 'galat' && <p className="galat" role="alert">Gagal memuat kamus. Periksa internet.</p>}
          {publik && publik !== 'galat' && publik.data.length === 0 && <p className="catatan">Kamus masih kosong.</p>}
          {publik && publik !== 'galat' && tersaring.length > 0 && (
            <ul className="daftar-kamus">
              {tersaring.slice(0, MAKS_TAMPIL).map((e) => (
                <li key={kunciKamus(e.a, e.b)}><span className="pasangan-kamus"><strong>{e.a}</strong> / <strong>{e.b}</strong><small>{e.k}</small></span></li>
              ))}
            </ul>
          )}
          {tersaring.length > MAKS_TAMPIL && <p className="catatan">Menampilkan {MAKS_TAMPIL} dari {tersaring.length}. Persempit pencarian.</p>}
          {publik && publik !== 'galat' && publik.dariCache && <p className="catatan">Dari cache di HP ini. Tekan Perbarui untuk data terbaru.</p>}
        </div>
        <div className="aksi-bawah" />
      </section>
    </main>
  );
}
