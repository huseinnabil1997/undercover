'use client';

// Akun pemain (Supabase Auth): status login, layar Masuk/Daftar, gerbang mode online, dan layar Profil.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { EVENT_DIKELUARKAN, JEDA_CEK_SESI_MS, PESAN_DIKELUARKAN, cekPassword, cekUsername, galatSesiTidakAktif, sesiDigantikan, emailDari, pesanGalatAuth, rapikanUsername, ringkasStatistik, type PeranDb, type RingkasanStatistik } from '@/lib/akun';
import { supabase } from '@/lib/supabase/klien';
import { Avatar } from './Avatar';
import { IkonDeretan, TeksGelar } from './Gelar';
import { siapkanAvatar } from '@/lib/gambarAvatar';
import { ambilUsernameDiganti, bisaGantiLagi, gantiUsername, hapusAvatar, lupakanProfil, unggahAvatar, ambilProfil, ambilProfilUsername, ambilRiwayat, ambilStatistik, cariProfil, type EntriRiwayat, type ProfilPublik } from '@/lib/supabase/data';
import {
  ambilGelarPemain, cekNotifikasiTop3, gelarTeksDari, kodeMusim, pasangGelar,
  teksGelar, tulisCacheGelar, type GelarPemainApi, type SlotMusimApi,
} from '@/lib/supabase/peringkatMusim';
import { META_KATEGORI, labelMusim } from '@/lib/peringkatMusim';
import { TombolSuara } from './PanelSuara';
import { JUDUL_MENANG, NAMA_PERAN, Tanda, TombolMenu, angka } from './ui';

export type Akun =
  | { status: 'memuat' }
  | { status: 'keluar' }
  | { status: 'masuk'; id: string; username: string };

const KonteksAkun = createContext<Akun>({ status: 'memuat' });
/** Buka profil pemain lain (read-only) berdasarkan username, dari mana saja (lobby, hasil, peringkat). */
const KonteksLihat = createContext<(username: string) => void>(() => {});

export function useLihatProfil(): (username: string) => void {
  return useContext(KonteksLihat);
}

export function useAkun(): Akun {
  return useContext(KonteksAkun);
}

function dariSesi(s: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null): Akun {
  if (!s) return { status: 'keluar' };
  const meta = s.user.user_metadata?.username;
  const username = typeof meta === 'string' && meta ? meta : (s.user.email ?? '').split('@')[0];
  return { status: 'masuk', id: s.user.id, username };
}

export function AkunProvider({ children }: { children: ReactNode }) {
  const [akun, setAkun] = useState<Akun>({ status: 'memuat' });
  const [pesanKeluar, setPesanKeluar] = useState<string | null>(null);
  useEffect(() => {
    let hidup = true;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      if (hidup) setAkun(dariSesi(data.session));
    }, () => {
      if (hidup) setAkun({ status: 'keluar' });
    });
    const { data } = sb.auth.onAuthStateChange((e, sesi) => {
      if (!hidup) return;
      setAkun(dariSesi(sesi));
      if (e === 'SIGNED_IN') setPesanKeluar(null);
    });
    return () => {
      hidup = false;
      data.subscription.unsubscribe();
    };
  }, []);
  // Single login: cek berkala (saat halaman terlihat) dan saat fokus apakah sesi ini masih yang aktif.
  const idMasuk = akun.status === 'masuk' ? akun.id : null;
  useEffect(() => {
    if (!idMasuk) return;
    let hidup = true;
    let sedang = false;
    const cek = async () => {
      if (sedang || document.visibilityState !== 'visible') return;
      sedang = true;
      try {
        const sb = supabase();
        const hasil = await sb.rpc('cek_sesi_aktif');
        const ditolak = galatSesiTidakAktif(hasil.error as { message?: string } | null);
        if (!hidup || !(sesiDigantikan(hasil) || ditolak)) return;
        hidup = false;
        // Beri tahu layar online agar keluar room dengan rapi, lalu keluar lokal saja (sesi perangkat lain tetap).
        window.dispatchEvent(new CustomEvent(EVENT_DIKELUARKAN));
        setPesanKeluar(PESAN_DIKELUARKAN);
        await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
      } catch {
        // Gangguan jaringan: coba lagi di putaran berikutnya.
      } finally {
        sedang = false;
      }
    };
    void cek();
    const id = window.setInterval(() => void cek(), JEDA_CEK_SESI_MS);
    const saatTerlihat = () => void cek();
    window.addEventListener('focus', saatTerlihat);
    document.addEventListener('visibilitychange', saatTerlihat);
    return () => {
      hidup = false;
      window.clearInterval(id);
      window.removeEventListener('focus', saatTerlihat);
      document.removeEventListener('visibilitychange', saatTerlihat);
    };
  }, [idMasuk]);
  const [lihat, setLihat] = useState<string | null>(null);
  const tutup = useCallback(() => setLihat(null), []);
  return (
    <KonteksAkun.Provider value={akun}>
      <KonteksLihat.Provider value={setLihat}>
        {children}
        {pesanKeluar && (
          <div className="pita-keluar" role="alert" id="pesan-dikeluarkan">
            <span>{pesanKeluar}</span>
            <button type="button" className="kedua" onClick={() => setPesanKeluar(null)}>Oke</button>
          </div>
        )}
        {lihat && akun.status === 'masuk' && (
          <div className="lapisan-profil" role="dialog" aria-modal="true" aria-label={`Profil ${lihat}`}>
            <LayarProfil key={lihat} akun={akun} usernameLihat={lihat} onBeranda={tutup} onKembali={tutup} />
          </div>
        )}
      </KonteksLihat.Provider>
    </KonteksAkun.Provider>
  );
}

export function Kepala({ onBeranda }: { onBeranda: () => void }) {
  return (
    <header className="kepala">
      <TombolMenu onClick={onBeranda} />
      <span className="logo"><Tanda /> Undercover</span>
      <TombolSuara />
    </header>
  );
}

/* ------------------------------ Masuk/Daftar ------------------------------ */

/** Single login: login terbaru menang, sesi akun ini di perangkat lain dicabut. */
async function keluarkanPerangkatLain(): Promise<void> {
  try {
    await supabase().auth.signOut({ scope: 'others' });
  } catch {
    // Gagal mencabut tidak menghalangi login; server tetap menolak sesi lama bila sudah dicabut.
  }
}

export function LayarAkun({ alasan, onBeranda }: { alasan?: string; onBeranda: () => void }) {
  const [tab, setTab] = useState<'masuk' | 'daftar'>('masuk');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ulang, setUlang] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [proses, setProses] = useState(false);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    const g = cekUsername(username) ?? cekPassword(password) ?? (tab === 'daftar' && ulang !== password ? 'Ulangi password tidak sama.' : null);
    if (g) {
      setGalat(g);
      return;
    }
    setGalat(null);
    setProses(true);
    try {
      const auth = supabase().auth;
      if (tab === 'masuk') {
        const { error } = await auth.signInWithPassword({ email: emailDari(username), password });
        if (error) setGalat(pesanGalatAuth(error));
        else await keluarkanPerangkatLain();
      } else {
        const { data, error } = await auth.signUp({
          email: emailDari(username),
          password,
          options: { data: { username: rapikanUsername(username) } },
        });
        if (error) setGalat(pesanGalatAuth(error));
        else if (data.session) await keluarkanPerangkatLain();
        else {
          // Konfirmasi email masih aktif di project: akun dibuat tetapi belum bisa dipakai login.
          setInfo('Akun dibuat, tetapi belum bisa dipakai karena konfirmasi email masih aktif di server. Hubungi pengelola game.');
        }
      }
    } catch (err) {
      setGalat(pesanGalatAuth(err as { message?: string }));
    } finally {
      setProses(false);
    }
  }

  return (
    <main className="wadah">
      <Kepala onBeranda={onBeranda} />
      <form className="tumpuk masuk" onSubmit={kirim} noValidate>
        <div className="kepala-fase"><h2>{tab === 'masuk' ? 'Masuk' : 'Daftar'}</h2></div>
        {alasan && <p className="catatan tengah-teks nol">{alasan}</p>}
        <div className="segmen" role="group" aria-label="Masuk atau daftar">
          <button type="button" aria-pressed={tab === 'masuk'} onClick={() => { setTab('masuk'); setGalat(null); setInfo(null); }}>Masuk</button>
          <button type="button" aria-pressed={tab === 'daftar'} onClick={() => { setTab('daftar'); setGalat(null); setInfo(null); }}>Daftar</button>
        </div>
        <div className="kartu">
          <label className="label" htmlFor="akun-username">Username</label>
          <input id="akun-username" className="isian" value={username} maxLength={20} autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder="Username" onChange={(e) => setUsername(e.target.value)} />
          <label className="label jarak-atas" htmlFor="akun-password">Password</label>
          <input id="akun-password" className="isian" type="password" value={password} autoComplete={tab === 'masuk' ? 'current-password' : 'new-password'}
            placeholder="Password" onChange={(e) => setPassword(e.target.value)} />
          {tab === 'daftar' && (
            <>
              <label className="label jarak-atas" htmlFor="akun-ulang">Ulangi password</label>
              <input id="akun-ulang" className="isian" type="password" value={ulang} autoComplete="new-password"
                placeholder="Ulangi password" onChange={(e) => setUlang(e.target.value)} />
              <p className="catatan">Username 3 sampai 20 karakter (huruf, angka, _), tidak bisa diganti. Password minimal 6 karakter dan tidak bisa dipulihkan bila lupa, jadi simpan baik-baik.</p>
            </>
          )}
        </div>
        {galat && <p className="galat" role="alert">{galat}</p>}
        {info && <p className="catatan tengah-teks" role="status">{info}</p>}
        <button className="utama" type="submit" disabled={proses}>{proses ? 'Memproses...' : tab === 'masuk' ? 'Masuk' : 'Daftar'}</button>
        <p className="catatan tengah-teks">Main Lokal (satu HP) tidak perlu akun.</p>
        <div className="aksi-bawah" />
      </form>
    </main>
  );
}

/** Tampilkan isi hanya bila sudah login; selain itu layar Masuk/Daftar. */
export function GerbangAkun({ alasan, onBeranda, children }: {
  alasan: string;
  onBeranda: () => void;
  children: (akun: { id: string; username: string }) => ReactNode;
}) {
  const akun = useAkun();
  if (akun.status === 'memuat') {
    return (
      <main className="wadah">
        <Kepala onBeranda={onBeranda} />
        <p className="catatan tengah-teks" role="status">Memuat akun...</p>
      </main>
    );
  }
  if (akun.status === 'keluar') return <LayarAkun alasan={alasan} onBeranda={onBeranda} />;
  return <>{children(akun)}</>;
}

/* --------------------------------- Profil --------------------------------- */

const URUTAN_PERAN: PeranDb[] = ['civilian', 'undercover', 'mrwhite', 'jester'];
const persenTeks = (p: number | null) => (p === null ? '-' : `${p}%`);

export function KartuStatistik({ r }: { r: RingkasanStatistik }) {
  return (
    <div className="kartu">
      <h2>Statistik</h2>
      <div className="stat-utama">
        <div><strong>{angka(r.main)}</strong><span>Main</span></div>
        <div><strong>{angka(r.menang)}</strong><span>Menang</span></div>
        <div><strong>{persenTeks(r.persen)}</strong><span>Menang</span></div>
      </div>
      <ul className="stat-peran">
        {URUTAN_PERAN.map((p) => (
          <li key={p}>
            <span>{NAMA_PERAN[p]}</span>
            <span>{angka(r.perPeran[p].main)} main</span>
            <strong>{persenTeks(r.perPeran[p].persen)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function waktuTeks(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Riwayat({ userId }: { userId: string }) {
  const [baris, setBaris] = useState<EntriRiwayat[]>([]);
  const [halaman, setHalaman] = useState(0);
  const [adaLagi, setAdaLagi] = useState(false);
  const [status, setStatus] = useState<'memuat' | 'siap' | 'galat'>('memuat');
  useEffect(() => {
    let hidup = true;
    ambilRiwayat(userId, halaman).then((h) => {
      if (!hidup) return;
      setBaris((lama) => (halaman === 0 ? h.baris : [...lama, ...h.baris]));
      setAdaLagi(h.adaLagi);
      setStatus('siap');
    }, () => hidup && setStatus('galat'));
    return () => {
      hidup = false;
    };
  }, [userId, halaman]);
  return (
    <div className="kartu">
      <h2>Riwayat</h2>
      {status === 'siap' && baris.length === 0 && <p className="catatan">Belum ada permainan online.</p>}
      <ul className="daftar-riwayat">
        {baris.map((b) => (
          <li key={b.id}>
            <div>
              <strong className={b.menang ? 'teks-menang' : 'teks-kalah'}>{b.menang ? 'Menang' : 'Kalah'}</strong>
              <span> sebagai {NAMA_PERAN[b.peran]}</span>
            </div>
            <div className="catatan nol">{b.kata_civilian} / {b.kata_undercover} · {b.jumlah_pemain} pemain · {JUDUL_MENANG[b.pemenang]}</div>
            <div className="catatan nol">{waktuTeks(b.waktu)}</div>
          </li>
        ))}
      </ul>
      {status === 'memuat' && <p className="catatan">Memuat...</p>}
      {status === 'galat' && <p className="galat">Gagal memuat riwayat.</p>}
      {adaLagi && status === 'siap' && (
        <button className="kedua jarak-atas" onClick={() => { setStatus('memuat'); setHalaman((h) => h + 1); }}>Muat lagi</button>
      )}
    </div>
  );
}

function tanggalTeks(d: Date): string {
  return `${d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB`;
}

/** Ganti username sendiri: sekali per 7 hari. Nama di room yang sedang berjalan tetap nama lama. */
function GantiUsername({ id, username, onGanti }: { id: string; username: string; onGanti: (baru: string) => void }) {
  const [buka, setBuka] = useState(false);
  const [baru, setBaru] = useState('');
  const [diganti, setDiganti] = useState<string | null | undefined>(undefined);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [proses, setProses] = useState(false);
  useEffect(() => {
    let hidup = true;
    ambilUsernameDiganti(id).then((d) => hidup && setDiganti(d), () => hidup && setDiganti(null));
    return () => {
      hidup = false;
    };
  }, [id]);
  const lagi = bisaGantiLagi(diganti ?? null);
  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    const nama = rapikanUsername(baru);
    const g = cekUsername(nama);
    if (g) return setPesan({ ok: false, teks: g });
    if (nama === username) return setPesan({ ok: false, teks: 'Username baru sama dengan yang sekarang.' });
    setProses(true);
    try {
      setDiganti(await gantiUsername(username, nama));
      setBaru('');
      setPesan({ ok: true, teks: `Username diganti menjadi ${nama}. Masuk berikutnya pakai nama ini.` });
      onGanti(nama);
    } catch (err) {
      setPesan({ ok: false, teks: err instanceof Error ? err.message : 'Gagal mengganti username.' });
    } finally {
      setProses(false);
    }
  }
  return (
    <div className="kartu">
      <h2>Username</h2>
      {lagi && <p className="catatan" data-uji="ganti-lagi">Bisa diganti lagi pada {tanggalTeks(lagi)}.</p>}
      {!buka ? (
        <>
          {pesan && <p className={pesan.ok ? 'catatan' : 'galat'} role="status">{pesan.teks}</p>}
          <button className="kedua" type="button" onClick={() => { setBuka(true); setPesan(null); }}>Ganti username</button>
        </>
      ) : (
        <form onSubmit={simpan} noValidate>
          <label className="label" htmlFor="username-baru">Username baru</label>
          <input id="username-baru" className="isian" value={baru} maxLength={20} autoComplete="off" autoCapitalize="none" placeholder="3 sampai 20 karakter" onChange={(e) => setBaru(e.target.value)} />
          <p className="catatan">Huruf, angka, atau underscore. Bisa diganti sekali tiap 7 hari. Statistik, riwayat, kamus, dan foto tetap. Di room yang sedang berjalan namamu tetap nama lama.</p>
          {pesan && <p className={pesan.ok ? 'catatan' : 'galat'} role="status">{pesan.teks}</p>}
          <div className="baris-tombol jarak-atas">
            <button className="kedua" type="button" onClick={() => { setBuka(false); setPesan(pesan?.ok ? pesan : null); }}>Batal</button>
            <button type="submit" disabled={proses}>Simpan</button>
          </div>
        </form>
      )}
    </div>
  );
}

function GantiPassword() {
  const [baru, setBaru] = useState('');
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [proses, setProses] = useState(false);
  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    const g = cekPassword(baru);
    if (g) {
      setPesan({ ok: false, teks: g });
      return;
    }
    setProses(true);
    const { error } = await supabase().auth.updateUser({ password: baru });
    setProses(false);
    setPesan(error ? { ok: false, teks: error.code === 'same_password' ? 'Password baru sama dengan yang lama.' : pesanGalatAuth(error) } : { ok: true, teks: 'Password diganti.' });
    if (!error) setBaru('');
  }
  return (
    <form className="kartu" onSubmit={simpan} noValidate>
      <h2>Ganti password</h2>
      <label className="label" htmlFor="pw-baru">Password baru</label>
      <input id="pw-baru" className="isian" type="password" value={baru} autoComplete="new-password" placeholder="Minimal 6 karakter" onChange={(e) => setBaru(e.target.value)} />
      {pesan && <p className={pesan.ok ? 'catatan' : 'galat'} role="status">{pesan.teks}</p>}
      <button className="kedua jarak-atas" type="submit" disabled={proses}>Simpan</button>
    </form>
  );
}

function FotoProfil({ id, username, versi, onGanti }: { id: string; username: string; versi: number | null; onGanti: (v: number | null) => void }) {
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  async function pilih(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setProses(true);
    setGalat(null);
    try {
      const blob = await siapkanAvatar(f);
      onGanti(await unggahAvatar(id, blob, versi));
      lupakanProfil(username);
    } catch (err) {
      setGalat(err instanceof Error && err.message.endsWith('.') ? err.message : 'Gagal mengunggah foto.');
    } finally {
      setProses(false);
    }
  }
  async function hapus() {
    setProses(true);
    setGalat(null);
    try {
      await hapusAvatar(id);
      lupakanProfil(username);
      onGanti(null);
    } catch {
      setGalat('Gagal menghapus foto.');
    } finally {
      setProses(false);
    }
  }
  return (
    <>
      <div className="baris-avatar">
        <label className={`kedua tombol-label${proses ? ' nonaktif' : ''}`}>
          {proses ? 'Memproses...' : versi ? 'Ganti foto' : 'Pasang foto'}
          <input type="file" accept="image/*" hidden disabled={proses} onChange={pilih} />
        </label>
        {versi && <button className="kedua" type="button" disabled={proses} onClick={hapus}>Hapus foto</button>}
      </div>
      {galat && <p className="galat" role="alert">{galat}</p>}
    </>
  );
}

function CariPemain() {
  const lihat = useLihatProfil();
  const [teks, setTeks] = useState('');
  const [hasil, setHasil] = useState<ProfilPublik[] | null>(null);
  const [galat, setGalat] = useState(false);
  async function cari(e: React.FormEvent) {
    e.preventDefault();
    setGalat(false);
    try {
      setHasil(await cariProfil(teks));
    } catch {
      setGalat(true);
    }
  }
  return (
    <form className="kartu" onSubmit={cari} role="search">
      <h2>Cari pemain</h2>
      <div className="baris-cari">
        <input className="isian" aria-label="Username" value={teks} maxLength={20} autoCapitalize="none" spellCheck={false}
          placeholder="Username" onChange={(e) => setTeks(e.target.value)} />
        <button className="kedua" type="submit" disabled={!teks.trim()}>Cari</button>
      </div>
      {galat && <p className="galat">Gagal mencari. Periksa internet.</p>}
      {hasil && hasil.length === 0 && <p className="catatan">Tidak ditemukan.</p>}
      {hasil && hasil.length > 0 && (
        <ul className="daftar-cari">
          {hasil.map((p) => (
            <li key={p.id}>
              <button type="button" className="tautan nama-dengan-avatar" onClick={() => lihat(p.username)}>
                <Avatar username={p.username} id={p.id} versi={p.avatar_versi} ukuran={28} /><span className="nama-teks">{p.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}


type InfoTampilGelar = { teks: string; frame: SlotMusimApi | null; keterangan: string | null };

/** Gelar musim berjalan (bisa dipilih) + daftar award teks bulan lalu. Frame hanya dari slot musim ini. */
function KartuGelar({ userId, sendiri, onTampil }: {
  userId: string;
  sendiri: boolean;
  /** Langsung perbarui frame avatar profil (optimistic). */
  onTampil?: (info: InfoTampilGelar) => void;
}) {
  const [gelar, setGelar] = useState<GelarPemainApi | null | 'galat'>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  useEffect(() => {
    let hidup = true;
    ambilGelarPemain([userId]).then(([g]) => {
      if (!hidup) return;
      setGelar(g ?? null);
      if (g) onTampil?.(gelarTeksDari(g));
      if (sendiri && g) {
        const n = cekNotifikasiTop3(g.slot);
        if (n) setPesan(n);
      }
    }, () => { if (hidup) setGelar('galat'); });
    return () => { hidup = false; };
  }, [userId, sendiri, onTampil]);
  if (gelar === 'galat') return <p className="galat" role="alert">Gagal memuat gelar.</p>;
  if (!gelar) return <p className="catatan" role="status">Memuat gelar...</p>;
  const tampil = gelarTeksDari(gelar);
  const musim = gelar.musim || kodeMusim();
  function pasang(nilai: string | null) {
    if (!sendiri || gelar === 'galat' || !gelar) return;
    const sebelumnya = gelar;
    const berikutnya: GelarPemainApi = { ...gelar, gelar_dipasang: nilai };
    // Optimistic: frame/teks profil + cache room langsung ikut pilihan.
    setGelar(berikutnya);
    const info = gelarTeksDari(berikutnya);
    onTampil?.(info);
    tulisCacheGelar(berikutnya);
    setPesan(null);
    void pasangGelar(nilai).then(() => {
      setPesan(nilai ? 'Gelar dipasang.' : 'Gelar otomatis.');
    }, (e: unknown) => {
      setGelar(sebelumnya);
      const balik = gelarTeksDari(sebelumnya);
      onTampil?.(balik);
      tulisCacheGelar(sebelumnya);
      setPesan(e instanceof Error ? e.message : 'Gagal memasang gelar.');
    });
  }
  const nilaiAktif = gelar.gelar_dipasang ?? 'otomatis';
  return (
    <div className="kartu">
      <h2>Gelar</h2>
      {tampil.teks ? (
        <p className="nol">
          <TeksGelar teks={tampil.teks} keterangan={tampil.keterangan} ikon={tampil.frame ? META_KATEGORI[tampil.frame.kategori].ikon : undefined} />
          {' '}
          <IkonDeretan slot={gelar.slot} />
        </p>
      ) : (
        <p className="catatan">Belum ada gelar musim {labelMusim(musim)}.</p>
      )}
      {pesan && <p className="catatan" role="status">{pesan}</p>}
      {gelar.slot.length > 0 && (
        <>
          <p className="catatan kecil-teks">Top 3 {labelMusim(musim)} (frame avatar hanya di musim ini)</p>
          {sendiri && (
            <div className="pilih-gelar" role="radiogroup" aria-label="Pilih gelar musim">
              <label>
                <input type="radio" name="gelar" checked={nilaiAktif === 'otomatis' || !gelar.gelar_dipasang} onChange={() => pasang(null)} />
                Otomatis (peringkat terbaik)
              </label>
              {gelar.slot.map((s) => {
                const nilai = `musim:${musim}:${s.kategori}:${s.peringkat}`;
                return (
                  <label key={nilai}>
                    <input type="radio" name="gelar" checked={nilaiAktif === nilai} onChange={() => pasang(nilai)} />
                    {META_KATEGORI[s.kategori].ikon} {teksGelar({ kategori: s.kategori, peringkat: s.peringkat, musim })}
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
      {gelar.award.length > 0 && (
        <>
          <h3 className="nol" style={{ marginTop: 12 }}>Award bulan lalu</h3>
          <p className="catatan kecil-teks">Hanya gelar teks di profil, tanpa frame.</p>
          <ul className="daftar-award">
            {gelar.award.map((a) => {
              const nilai = `award:${a.id}`;
              const teks = teksGelar({ kategori: a.kategori, peringkat: a.peringkat, musim: a.musim, sumber: 'award' });
              return (
                <li key={a.id}>
                  <span>{META_KATEGORI[a.kategori].ikon} {teks}</span>
                  {sendiri && (
                    <button type="button" className={`kecil mini${nilaiAktif === nilai ? ' utama' : ' kedua'}`} onClick={() => pasang(nilaiAktif === nilai ? null : nilai)}>
                      {nilaiAktif === nilai ? 'Dipakai' : 'Pakai'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Profil sendiri (lengkap) atau pemain lain (read-only: statistik dan riwayat). */
export function LayarProfil({ akun, usernameLihat, onBeranda, onKembali }: {
  akun: { id: string; username: string };
  usernameLihat?: string;
  onBeranda: () => void;
  onKembali?: () => void;
}) {
  const [data, setData] = useState<{ id: string; username: string; versi: number | null; r: RingkasanStatistik } | 'galat' | 'tidakAda' | null>(null);
  const [infoGelar, setInfoGelar] = useState<InfoTampilGelar | null>(null);
  const onTampilGelar = useCallback((info: InfoTampilGelar) => setInfoGelar(info), []);
  useEffect(() => {
    let hidup = true;
    (async () => {
      const p = usernameLihat ? await ambilProfilUsername(usernameLihat) : await ambilProfil(akun.id);
      if (!p) return null;
      return { id: p.id, username: p.username, versi: p.avatar_versi, r: ringkasStatistik(await ambilStatistik(p.id)) };
    })().then((d) => hidup && setData(d ?? 'tidakAda'), () => hidup && setData('galat'));
    return () => {
      hidup = false;
    };
  }, [akun.id, usernameLihat]);
  const siap = data && typeof data === 'object' ? data : null;
  const sendiri = siap ? siap.id === akun.id : !usernameLihat;
  return (
    <main className="wadah">
      <Kepala onBeranda={onBeranda} />
      <section className="tumpuk masuk">
        <div className="profil-kepala">
          <Avatar username={siap ? siap.username : usernameLihat ?? akun.username} id={siap?.id ?? 'memuat'} versi={siap?.versi} ukuran={88} slot={infoGelar?.frame} />
          <h2 className="nol">{siap ? siap.username : usernameLihat ?? akun.username}</h2>
          {infoGelar?.teks && <TeksGelar teks={infoGelar.teks} keterangan={infoGelar.keterangan} />}
          {siap && sendiri && !usernameLihat && (
            <FotoProfil id={siap.id} username={siap.username} versi={siap.versi} onGanti={(v) => setData({ ...siap, versi: v })} />
          )}
        </div>
        {onKembali && <button className="kedua" onClick={onKembali}>Kembali</button>}
        {data === 'galat' && <p className="galat" role="alert">Gagal memuat profil. Periksa internet.</p>}
        {data === 'tidakAda' && <p className="catatan tengah-teks">Pemain tidak ditemukan.</p>}
        {data === null && <p className="catatan tengah-teks" role="status">Memuat...</p>}
        {siap && <KartuGelar userId={siap.id} sendiri={sendiri && !usernameLihat} onTampil={onTampilGelar} />}
        {siap && <KartuStatistik r={siap.r} />}
        {siap && <Riwayat userId={siap.id} />}
        {sendiri && !usernameLihat && <CariPemain />}
        {siap && sendiri && !usernameLihat && <GantiUsername id={siap.id} username={siap.username} onGanti={(u) => setData({ ...siap, username: u })} />}
        {sendiri && !usernameLihat && <GantiPassword />}
        {sendiri && !usernameLihat && <button className="kedua" onClick={() => void supabase().auth.signOut({ scope: 'local' })}>Keluar akun</button>}
        <p className="catatan tengah-teks">Hanya permainan Online yang dicatat. Main Lokal tidak dicatat.</p>
        <div className="aksi-bawah" />
      </section>
    </main>
  );
}
