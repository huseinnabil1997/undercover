'use client';

// Halaman Masukan: kirim saran/feedback, upvote, urut vote/terbaru.
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import {
  ambilMasukan,
  KATEGORI_MASUKAN,
  kirimMasukan,
  labelKategori,
  labelStatus,
  MAKS_ISI_MASUKAN,
  pesanMasukan,
  terapkanToggleVote,
  toggleVoteMasukan,
  URUT_MASUKAN,
  urutBarisMasukan,
  validasiIsiMasukan,
  type BarisMasukan,
  type KategoriMasukan,
  type UrutMasukan,
} from '@/lib/supabase/masukan';
import { Kepala, useLihatProfil } from './Akun';

export function LayarMasukan({ akun, onBeranda }: { akun: { id: string; username: string }; onBeranda: () => void }) {
  return (
    <main className="wadah">
      <Kepala onBeranda={onBeranda} />
      <section className="tumpuk masuk">
        <div className="kepala-fase"><h2>Masukan</h2></div>
        <IsiMasukan akun={akun} />
        <div className="aksi-bawah" />
      </section>
    </main>
  );
}

export function IsiMasukan({ akun }: { akun: { id: string; username: string } }) {
  const lihat = useLihatProfil();
  const [urut, setUrut] = useState<UrutMasukan>('vote');
  const [data, setData] = useState<BarisMasukan[] | 'galat' | null>(null);
  const [muat, setMuat] = useState(0);
  const [isi, setIsi] = useState('');
  const [kategori, setKategori] = useState<KategoriMasukan>('lainnya');
  const [kirim, setKirim] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const formId = useId();

  const muatUlang = useCallback(() => {
    setData(null);
    setMuat((n) => n + 1);
  }, []);

  useEffect(() => {
    let hidup = true;
    ambilMasukan(urut).then(
      (d) => { if (hidup) setData(urutBarisMasukan(d, urut)); },
      () => { if (hidup) setData('galat'); },
    );
    return () => { hidup = false; };
  }, [urut, muat]);

  async function onKirim(e: FormEvent) {
    e.preventDefault();
    const v = validasiIsiMasukan(isi);
    if (v) { setGalatForm(v); return; }
    setKirim(true);
    setGalatForm(null);
    setPesan(null);
    try {
      await kirimMasukan(isi, kategori);
      setIsi('');
      setPesan('Masukan terkirim. Terima kasih!');
      muatUlang();
    } catch (err) {
      setGalatForm(pesanMasukan(err as { code?: string; message?: string }));
    } finally {
      setKirim(false);
    }
  }

  async function onVote(b: BarisMasukan) {
    if (!Array.isArray(data)) return;
    const target = !b.saya_vote;
    const sebelum = data;
    setData(urutBarisMasukan(data.map((x) => (x.id === b.id ? terapkanToggleVote(x, target) : x)), urut));
    try {
      const aktif = await toggleVoteMasukan(b.id);
      setData((lama) => {
        if (!Array.isArray(lama)) return lama;
        return urutBarisMasukan(lama.map((x) => {
          if (x.id !== b.id) return x;
          return x.saya_vote === aktif ? x : terapkanToggleVote(x, aktif);
        }), urut);
      });
    } catch {
      setData(sebelum);
    }
  }

  const sisa = MAKS_ISI_MASUKAN - [...isi].length;

  return (
    <>
      <form className="kartu form-masukan" onSubmit={(e) => void onKirim(e)} aria-labelledby={formId}>
        <h3 id={formId} className="judul-kartu">Kirim masukan</h3>
        <p className="catatan nol">Saran, laporan bug, atau ide fitur. Maksimal 5 kiriman per hari.</p>
        <span className="label">Kategori</span>
        <div className="chip-grup" role="group" aria-label="Kategori masukan">
          {KATEGORI_MASUKAN.map((k) => (
            <button key={k.id} type="button" className={`chip${kategori === k.id ? ' pilih' : ''}`} aria-pressed={kategori === k.id} onClick={() => setKategori(k.id)}>{k.nama}</button>
          ))}
        </div>
        <label className="dialog-label">
          Isi
          <textarea
            className="dialog-input area-masukan"
            value={isi}
            maxLength={MAKS_ISI_MASUKAN}
            rows={4}
            placeholder="Tulis masukan singkat..."
            onChange={(e) => setIsi(e.target.value)}
          />
        </label>
        <p className={`catatan nol${sisa < 40 ? ' galat' : ''}`}>{sisa} karakter tersisa</p>
        {galatForm && <p className="galat" role="alert">{galatForm}</p>}
        {pesan && <p className="catatan" role="status">{pesan}</p>}
        <button type="submit" className="utama" disabled={kirim || !isi.trim()}>{kirim ? 'Mengirim...' : 'Kirim'}</button>
      </form>

      <div className="kartu">
        <span className="label">Urutkan</span>
        <div className="chip-grup" role="group" aria-label="Urutkan masukan">
          {URUT_MASUKAN.map((x) => (
            <button key={x.id} type="button" className={`chip${urut === x.id ? ' pilih' : ''}`} aria-pressed={urut === x.id} onClick={() => { setData(null); setUrut(x.id); }}>{x.nama}</button>
          ))}
        </div>
      </div>

      {data === null && <p className="catatan tengah-teks" role="status">Memuat...</p>}
      {data === 'galat' && (
        <>
          <p className="galat" role="alert">Gagal memuat masukan. Periksa internet.</p>
          <button type="button" className="kedua" onClick={muatUlang}>Coba lagi</button>
        </>
      )}
      {Array.isArray(data) && data.length === 0 && <p className="catatan tengah-teks">Belum ada masukan. Jadilah yang pertama.</p>}
      {Array.isArray(data) && data.length > 0 && (
        <ul className="kartu daftar-masukan">
          {data.map((b) => (
            <li key={b.id} className={b.user_id === akun.id ? 'sendiri' : undefined}>
              <div className="masukan-meta">
                <button type="button" className="tautan" aria-label={`Lihat profil ${b.username}`} onClick={() => lihat(b.username)}>{b.username}</button>
                {b.user_id === akun.id && <em className="label-kamu">(kamu)</em>}
                <span className={`lencana status-masukan status-${b.status}`}>{labelStatus(b.status)}</span>
                <span className="lencana off">{labelKategori(b.kategori)}</span>
              </div>
              <p className="masukan-isi">{b.isi}</p>
              <div className="masukan-aksi">
                <button
                  type="button"
                  className={`kecil${b.saya_vote ? ' pilih' : ''}`}
                  aria-pressed={b.saya_vote}
                  onClick={() => void onVote(b)}
                >
                  {b.saya_vote ? 'Batal upvote' : 'Upvote'} · {b.jumlah_vote}
                </button>
                <time className="catatan nol" dateTime={b.dibuat}>{formatWaktu(b.dibuat)}</time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function formatWaktu(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
