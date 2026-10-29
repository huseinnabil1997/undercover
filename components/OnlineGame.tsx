'use client';

// Mode online: setiap pemain memakai HP sendiri. HP host memegang state lengkap dan hanya
// mengirim view yang sudah difilter (kata milik pemain itu sendiri) ke setiap pemain.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { komposisiDefault, MIN_PEMAIN, validasiSetup, type Komposisi } from '@/lib/game';
import { rapikanKategori, SEMUA_KATEGORI, siapkanPasangan } from '@/lib/bankKata';
import { baca, KUNCI, simpan } from '@/lib/storage';
import { buatStateHost, MAKS_NAMA, pulihkanStateHost, rapikanNama, viewUntuk } from '@/lib/online/host';
import { HostRoom, KlienRoom, type StatusJaringan } from '@/lib/online/jaringan';
import { buatIdPemain, buatKodeRoom, kodeValid, rapikanKode } from '@/lib/online/room';
import {
  bacaSesi, bacaStateHostMentah, buatToken, hapusSesi, hapusStateHost, simpanSesi, simpanStateHost, type SesiOnline,
} from '@/lib/online/sesi';
import type { Aksi, AksiKhususHost, AksiPemain, GameView, PemainView, StateHost, ViewPemain } from '@/lib/online/types';
import {
  angka, AturPeran, JUDUL_MENANG, KartuBalik, Konfeti, NAMA_PERAN, PilihKategori, useDaftarKeluar,
} from './ui';
import { useDialog } from './Modal';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const KUNCI_NAMA_ONLINE = 'online:nama';

const TEKS_STATUS: Record<StatusJaringan, string> = {
  menyambung: 'Menyambung...',
  tersambung: 'Tersambung',
  menyambungUlang: 'Menyambung ulang...',
  hostTidakAda: 'Host tidak ditemukan. Mencoba lagi...',
  idDipakai: 'Menyiapkan room...',
  gagal: 'Gagal tersambung',
};

type AksiUi = AksiPemain | AksiKhususHost;

export default function OnlineGame({ kodeAwal, onBeranda }: { kodeAwal: string | null; onBeranda: () => void }) {
  const dialog = useDialog();
  const [sesi, setSesi] = useState<SesiOnline | null>(() => bacaSesi('tab'));
  const [view, setView] = useState<ViewPemain | null>(null);
  const [status, setStatus] = useState<{ s: StatusJaringan; info?: string }>({ s: 'menyambung' });
  const [galatMasuk, setGalatMasuk] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const hostRef = useRef<HostRoom | null>(null);
  const klienRef = useRef<KlienRoom | null>(null);

  const tampilkan = useCallback((t: string) => setToast(t), []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const keluarSesi = useCallback((alasan?: string) => {
    hostRef.current?.hentikan();
    klienRef.current?.hentikan();
    hostRef.current = null;
    klienRef.current = null;
    hapusSesi();
    setSesi(null);
    setView(null);
    setGalatMasuk(alasan ?? null);
  }, []);

  // Sambungkan sesuai sesi (host atau pemain). Dibersihkan saat sesi berganti atau komponen ditutup.
  useEffect(() => {
    if (!sesi) return;
    simpanSesi({ ...sesi, waktu: Date.now() });
    if (sesi.host) {
      const pulih = pulihkanStateHost(bacaStateHostMentah(), Date.now());
      const dipulihkan = !!pulih && pulih.kode === sesi.kode && pulih.hostId === sesi.id;
      const awal: StateHost = dipulihkan
        ? (pulih as StateHost)
        : buatStateHost(sesi.kode, sesi.id, sesi.nama, {
          komposisi: komposisiDefault(MIN_PEMAIN),
          kategori: (() => {
            const k = rapikanKategori(baca<unknown>(KUNCI.kategori, null));
            return k.length > 0 ? k : SEMUA_KATEGORI;
          })(),
        }, Date.now());
      simpanStateHost(awal);
      const host = new HostRoom(awal, {
        onState: (s) => {
          simpanStateHost(s);
          setView(viewUntuk(s, sesi.id));
        },
        onStatus: (s, info) => {
          setStatus({ s, info });
          // Kode bentrok dengan room lain yang masih aktif: buat kode baru selama room masih kosong.
          if (s === 'idDipakai' && !dipulihkan && host.state.pemain.length === 1 && !host.state.game && Number(info) >= 2) {
            setSesi({ ...sesi, kode: buatKodeRoom() });
          }
        },
      });
      hostRef.current = host;
      void host.mulai();
      return () => {
        host.hentikan();
        if (hostRef.current === host) hostRef.current = null;
      };
    }
    const klien = new KlienRoom(sesi.kode, { id: sesi.id, nama: sesi.nama, token: sesi.token }, {
      onView: (v) => {
        if (!v.pemain.some((p) => p.id === v.saya)) {
          keluarSesi('Kamu dikeluarkan dari room oleh host.');
          return;
        }
        setView(v);
      },
      onStatus: (s, info) => setStatus({ s, info }),
      onTolak: (alasan, saatGabung) => {
        if (saatGabung) keluarSesi(alasan);
        else tampilkan(alasan);
      },
    });
    klienRef.current = klien;
    void klien.mulai();
    return () => {
      klien.hentikan();
      if (klienRef.current === klien) klienRef.current = null;
    };
  }, [sesi, keluarSesi, tampilkan]);

  const aksi = useCallback(
    (a: AksiUi) => {
      if (!sesi) return;
      if (hostRef.current) {
        const t = hostRef.current.dispatch({ ...a, dari: sesi.id } as Aksi);
        if (t) tampilkan(t);
      } else if (klienRef.current) {
        if (!klienRef.current.kirim(a as AksiPemain)) tampilkan('Belum tersambung ke host. Coba lagi sebentar.');
      }
    },
    [sesi, tampilkan],
  );

  const mulaiGame = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    setMemuat(true);
    try {
      const pasangan = await siapkanPasangan(host.state.pengaturan.kategori);
      aksi({ jenis: 'mulai', pasangan });
    } catch {
      tampilkan('Gagal memuat bank kata. Periksa koneksi lalu coba lagi.');
    } finally {
      setMemuat(false);
    }
  }, [aksi, tampilkan]);

  async function keluar() {
    if (!sesi) return;
    const ya = await dialog.konfirmasi(
      sesi.host
        ? { judul: 'Tutup room?', pesan: `Room ${sesi.kode} ditutup dan semua pemain akan terputus.`, ok: 'Tutup room', bahaya: true }
        : { judul: 'Keluar dari room?', pesan: 'Kamu bisa gabung lagi dengan kode yang sama selama room masih dibuka.', ok: 'Keluar', bahaya: true },
    );
    if (!ya) return;
    if (sesi.host) hapusStateHost();
    else aksi({ jenis: 'keluar' });
    // Beri waktu pesan keluar terkirim sebelum koneksi ditutup.
    window.setTimeout(() => keluarSesi(), sesi.host ? 0 : 150);
  }

  if (!sesi) {
    return (
      <LayarMasuk
        kodeAwal={kodeAwal}
        galat={galatMasuk}
        onBeranda={onBeranda}
        onMasuk={(s) => {
          setGalatMasuk(null);
          setView(null);
          setStatus({ s: 'menyambung' });
          setSesi(s);
        }}
      />
    );
  }

  return (
    <main className="wadah">
      <header className="kepala">
        <div className="info-room">
          <span className="logo-kecil" aria-hidden>🕵️</span>
          <span className="kode-kecil" aria-label={`Kode room ${sesi.kode}`}>{sesi.kode}</span>
          <span className={`status ${status.s}`} role="status">
            <span className="titik" aria-hidden />
            {TEKS_STATUS[status.s]}
          </span>
        </div>
        <button className="kecil" onClick={keluar}>{sesi.host ? 'Tutup room' : 'Keluar'}</button>
      </header>

      {toast && <p className="toast" role="alert">{toast}</p>}

      {!view ? (
        <section className="tumpuk tengah masuk">
          <div className="kartu besar">
            <div className="pemutar" aria-hidden />
            <p>{status.s === 'hostTidakAda' ? `Room ${sesi.kode} belum ditemukan. Pastikan HP host membuka room ini dan kodenya benar.` : `Menyambung ke room ${sesi.kode}...`}</p>
            {status.s === 'gagal' && <p className="catatan">{status.info}</p>}
            <p className="catatan">Jika lama tidak tersambung, jaringan ini mungkin memblokir koneksi langsung antar HP. Coba pakai data seluler atau Wi-Fi lain.</p>
          </div>
        </section>
      ) : (
        <Ruang view={view} host={sesi.host} aksi={aksi} mulaiGame={mulaiGame} memuat={memuat} tampilkan={tampilkan} />
      )}
    </main>
  );
}

/* --------------------------------- Masuk --------------------------------- */

function LayarMasuk({ kodeAwal, galat, onBeranda, onMasuk }: {
  kodeAwal: string | null;
  galat: string | null;
  onBeranda: () => void;
  onMasuk: (s: SesiOnline) => void;
}) {
  const [nama, setNama] = useState(() => baca<string>(KUNCI_NAMA_ONLINE, ''));
  const [kode, setKode] = useState(kodeAwal ?? '');
  const [lanjut] = useState(() => bacaSesi('perangkat'));
  const namaBersih = rapikanNama(nama);
  const kodeBersih = rapikanKode(kode);

  function masuk(host: boolean) {
    if (!namaBersih) return;
    simpan(KUNCI_NAMA_ONLINE, namaBersih);
    onMasuk({
      kode: host ? buatKodeRoom() : kodeBersih,
      id: buatIdPemain(),
      token: buatToken(),
      nama: namaBersih,
      host,
      waktu: 0, // diisi saat sesi disimpan
    });
  }

  return (
    <main className="wadah">
      <header className="kepala">
        <button className="logo" onClick={onBeranda}><span aria-hidden>🕵️</span> Undercover</button>
        <button className="kecil" onClick={onBeranda}>Beranda</button>
      </header>
      <section className="tumpuk masuk">
        <div className="kartu">
          <h2>Main online</h2>
          <p className="catatan">Setiap pemain memakai HP sendiri. Kata hanya muncul di HP masing-masing.</p>
          <label className="label" htmlFor="nama-online">Nama kamu</label>
          <input
            id="nama-online"
            className="isian"
            value={nama}
            maxLength={MAKS_NAMA}
            autoComplete="nickname"
            placeholder="Contoh: Budi"
            onChange={(e) => setNama(e.target.value)}
          />
        </div>

        {galat && <p className="galat" role="alert">{galat}</p>}

        {lanjut && (
          <div className="kartu">
            <h2>Lanjutkan room {lanjut.kode}</h2>
            <p className="catatan">Sebagai {lanjut.nama}{lanjut.host ? ' (host)' : ''}.</p>
            <div className="baris-tombol">
              <button className="utama" onClick={() => onMasuk({ ...lanjut, waktu: Date.now() })}>Lanjutkan</button>
              <button className="kedua" onClick={() => { hapusSesi(); window.location.reload(); }}>Lupakan</button>
            </div>
          </div>
        )}

        <div className="kartu">
          <h2>Gabung ke room</h2>
          <label className="label" htmlFor="kode-room">Kode room</label>
          <input
            id="kode-room"
            className="isian kode"
            value={kode}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="Contoh: K7QX2"
            onChange={(e) => setKode(rapikanKode(e.target.value))}
          />
          {kode && !kodeValid(kodeBersih) && <p className="catatan">Kode terdiri dari 4 sampai 6 huruf/angka (tanpa O, 0, I, 1, L).</p>}
          <button className="utama jarak-atas" disabled={!namaBersih || !kodeValid(kodeBersih)} onClick={() => masuk(false)}>Gabung</button>
        </div>

        <div className="kartu">
          <h2>Buat room baru</h2>
          <p className="catatan">HP kamu menjadi host. Biarkan halaman ini tetap terbuka selama bermain.</p>
          <button className={kodeAwal ? 'kedua jarak-atas' : 'utama jarak-atas'} disabled={!namaBersih} onClick={() => masuk(true)}>Buat room</button>
        </div>
        {!namaBersih && <p className="catatan tengah-teks">Isi nama dulu untuk gabung atau membuat room.</p>}
        <div className="aksi-bawah" />
      </section>
    </main>
  );
}

/* --------------------------------- Ruang --------------------------------- */

interface PropsRuang {
  view: ViewPemain;
  host: boolean;
  aksi: (a: AksiUi) => void;
  mulaiGame: () => void;
  memuat: boolean;
  tampilkan: (t: string) => void;
}

function Ruang(props: PropsRuang) {
  const { view } = props;
  const g = view.game;
  const kunci = !g ? 'lobby' : `${g.fase}-${g.ronde}-${g.putaranVote}-${g.ikut ? 1 : 0}`;
  let isi;
  if (!g) isi = <Lobby {...props} />;
  else if (g.fase === 'hasil') isi = <Hasil {...props} g={g} />;
  else if (!g.ikut) isi = <Penonton {...props} g={g} />;
  else if (g.fase === 'kata') isi = <FaseKata {...props} g={g} />;
  else if (g.fase === 'diskusi') isi = <Diskusi {...props} g={g} />;
  else if (g.fase === 'vote') isi = <Voting {...props} g={g} />;
  else isi = <Terungkap {...props} g={g} />;
  return <div key={kunci} className="masuk">{isi}</div>;
}

function namaDari(view: ViewPemain, id: string | null): string {
  return view.pemain.find((p) => p.id === id)?.nama ?? '?';
}

function Lobby({ view, host, aksi, mulaiGame, memuat, tampilkan }: PropsRuang) {
  const online = view.pemain.filter((p) => p.online);
  const [manual, setManual] = useState(false);
  const { komposisi, kategori } = view.pengaturan;
  const galat = useMemo(() => {
    const g = validasiSetup(online.map((p) => p.nama), komposisi);
    if (kategori.length === 0) g.push('Pilih minimal 1 kategori kata.');
    return g;
  }, [online, komposisi, kategori]);

  const jumlah = online.length;
  // Selama host belum mengatur manual, komposisi mengikuti jumlah pemain online.
  useEffect(() => {
    if (!host || manual) return;
    const k = komposisiDefault(Math.max(MIN_PEMAIN, jumlah));
    if (k.undercover !== komposisi.undercover || k.mrWhite !== komposisi.mrWhite) {
      aksi({ jenis: 'aturPengaturan', pengaturan: { komposisi: k, kategori } });
    }
  }, [host, manual, jumlah, komposisi, kategori, aksi]);

  const aturKomposisi = (k: Komposisi) => {
    setManual(true);
    aksi({ jenis: 'aturPengaturan', pengaturan: { komposisi: k, kategori } });
  };
  const aturKategori = (k: string[]) => {
    simpan(KUNCI.kategori, k);
    aksi({ jenis: 'aturPengaturan', pengaturan: { komposisi, kategori: k } });
  };

  return (
    <section className="tumpuk">
      <KartuUndangan kode={view.kode} tampilkan={tampilkan} />
      <DaftarPemain view={view} host={host} aksi={aksi} />
      <AturPeran
        jumlah={jumlah}
        komposisi={komposisi}
        nonaktif={!host}
        onUbah={aturKomposisi}
        onOtomatis={() => {
          setManual(false);
          aksi({ jenis: 'aturPengaturan', pengaturan: { komposisi: komposisiDefault(Math.max(MIN_PEMAIN, jumlah)), kategori } });
        }}
      />
      <PilihKategori kategori={kategori} onUbah={aturKategori} nonaktif={!host} />
      <Skor view={view} />
      {galat.length > 0 && (
        <ul className="galat" role="alert">
          {galat.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      <div className="aksi-bawah">
        {host ? (
          <button className="utama" disabled={galat.length > 0 || memuat} onClick={mulaiGame}>
            {memuat ? 'Menyiapkan kata...' : `Mulai main (${jumlah} pemain)`}
          </button>
        ) : (
          <p className="menunggu">Menunggu host memulai permainan...</p>
        )}
      </div>
    </section>
  );
}

function KartuUndangan({ kode, tampilkan }: { kode: string; tampilkan: (t: string) => void }) {
  const dialog = useDialog();
  const link = `${window.location.origin}${BASE}/?room=${kode}`;
  const [qr, setQr] = useState<string | null>(null);
  const [tampilQr, setTampilQr] = useState(false);
  useEffect(() => {
    if (!tampilQr || qr) return;
    let batal = false;
    void import('qrcode').then((m) => m.default.toDataURL(link, { margin: 1, width: 240 })).then((url) => {
      if (!batal) setQr(url);
    }).catch(() => undefined);
    return () => {
      batal = true;
    };
  }, [tampilQr, qr, link]);

  async function salin() {
    try {
      await navigator.clipboard.writeText(link);
      tampilkan('Link room disalin.');
    } catch {
      await dialog.info({
        judul: 'Salin link room',
        pesan: 'Browser tidak mengizinkan salin otomatis. Tekan lama teks di bawah lalu pilih Salin.',
        teksSalin: link,
        ok: 'Selesai',
      });
    }
  }

  async function bagikan() {
    try {
      await navigator.share({ title: 'Main Undercover', text: `Gabung room Undercover, kode ${kode}`, url: link });
    } catch {
      // dibatalkan
    }
  }

  return (
    <div className="kartu undangan">
      <p className="sub">Kode room</p>
      <p className="kode-besar" aria-label={`Kode room ${kode.split('').join(' ')}`}>{kode}</p>
      <p className="catatan">Ajak teman membuka link atau memasukkan kode ini di menu Main Online.</p>
      <div className="baris-tombol">
        <button className="kedua" onClick={salin}>Salin link</button>
        {typeof navigator !== 'undefined' && 'share' in navigator && <button className="kedua" onClick={bagikan}>Bagikan</button>}
        <button className="kedua" aria-expanded={tampilQr} onClick={() => setTampilQr((x) => !x)}>{tampilQr ? 'Tutup QR' : 'QR'}</button>
      </div>
      {tampilQr && (
        <div className="qr masuk">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR berupa data URL lokal */}
          {qr ? <img src={qr} alt={`QR untuk gabung room ${kode}`} width={240} height={240} /> : <div className="pemutar" aria-hidden />}
        </div>
      )}
    </div>
  );
}

function DaftarPemain({ view, host, aksi }: { view: ViewPemain; host: boolean; aksi: (a: AksiUi) => void }) {
  const dialog = useDialog();
  const daftar = useDaftarKeluar(view.pemain, (p) => p.id);
  return (
    <div className="kartu">
      <div className="baris-judul">
        <h2>Pemain</h2>
        <span className="catatan nol">{view.pemain.filter((p) => p.online).length} online</span>
      </div>
      <ul className="daftar-lobby">
        {daftar.map(({ item: p, keluar }) => (
          <li key={p.id} className={`${keluar ? 'keluar' : ''} ${p.online ? '' : 'offline'}`}>
            <span className={`titik ${p.online ? 'on' : 'off'}`} aria-hidden />
            <span className="nama">
              {p.nama}
              {p.id === view.saya && <em> (kamu)</em>}
            </span>
            {p.host && <span className="lencana host">Host</span>}
            {!p.online && <span className="lencana off">Offline</span>}
            {host && !p.host && !keluar && (
              <button
                className="kecil mini"
                onClick={async () => {
                  const ya = await dialog.konfirmasi({
                    judul: `Keluarkan ${p.nama}?`,
                    pesan: `${p.nama} akan dikeluarkan dari room ini.`,
                    ok: 'Keluarkan',
                    bahaya: true,
                  });
                  if (ya) aksi({ jenis: 'keluarkan', id: p.id });
                }}
                aria-label={`Keluarkan ${p.nama}`}
              >
                Keluarkan
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Skor({ view }: { view: ViewPemain }) {
  const daftar = Object.entries(view.skor).sort((a, b) => b[1] - a[1]);
  if (daftar.length === 0) return null;
  return (
    <div className="kartu">
      <h2>Skor room ini</h2>
      <ol className="daftar-hasil">
        {daftar.map(([n, s]) => (
          <li key={n}><span>{n}</span><span className="poin">{angka(s)} poin</span></li>
        ))}
      </ol>
      <p className="catatan">Civilian menang: +2, Mr. White menang: +6, Undercover menang: +10.</p>
    </div>
  );
}

/* --------------------------------- Permainan -------------------------------- */

type PropsFase = PropsRuang & { g: GameView };

function KataSaya({ view, g, ringkas }: { view: ViewPemain; g: GameView; ringkas?: boolean }) {
  const [lihat, setLihat] = useState(false);
  const saya = namaDari(view, view.saya);
  const belakang = (
    <>
      <p className="sub">{saya}, kata kamu:</p>
      {g.kata ? <h1 className="kata">{g.kata}</h1> : <h1 className="kata">Kamu Mr. White</h1>}
      {!g.kata && <p className="catatan">Kamu tidak mendapat kata. Dengarkan petunjuk pemain lain dan berbaurlah.</p>}
      <button className="kedua" onClick={() => setLihat(false)}>Tutup kartu</button>
    </>
  );
  if (ringkas) {
    return lihat ? (
      <div className="kartu besar rahasia muncul">{belakang}</div>
    ) : (
      <button className="kedua" onClick={() => setLihat(true)}>Intip kata saya</button>
    );
  }
  return (
    <KartuBalik
      terbuka={lihat}
      depan={
        <>
          <p className="sub">Ronde {g.ronde}</p>
          <h1 className="nama-besar">{saya}</h1>
          <p className="catatan">Pastikan orang lain tidak melihat layarmu.</p>
          <button className="utama" onClick={() => setLihat(true)}>Lihat kata saya</button>
        </>
      }
      belakang={belakang}
    />
  );
}

function Progres({ nilai, total, label }: { nilai: number; total: number; label: string }) {
  const persen = total > 0 ? Math.round((nilai / total) * 100) : 0;
  return (
    <div className="progres">
      <div className="progres-teks"><span>{label}</span><strong>{nilai}/{total}</strong></div>
      <div className="progres-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={nilai} aria-label={label}>
        <span style={{ width: `${persen}%` }} />
      </div>
    </div>
  );
}

function pesertaDari(view: ViewPemain): PemainView[] {
  return view.pemain.filter((p) => p.ikut);
}

function FaseKata({ view, g, host, aksi }: PropsFase) {
  const peserta = pesertaDari(view);
  const sudah = g.siap.includes(view.saya);
  return (
    <section className="tumpuk">
      <KataSaya view={view} g={g} />
      <div className="kartu">
        <Progres nilai={g.siap.length} total={peserta.length} label="Pemain siap" />
        <ul className="chip-grup kecil-jarak">
          {peserta.map((p) => (
            <li key={p.id} className={`chip-status ${g.siap.includes(p.id) ? 'ok' : ''} ${p.online ? '' : 'offline'}`}>
              {g.siap.includes(p.id) ? '✓ ' : ''}{p.nama}
            </li>
          ))}
        </ul>
        <p className="catatan">Diskusi dimulai otomatis setelah semua pemain siap.</p>
      </div>
      <div className="aksi-bawah">
        <button className="utama" disabled={sudah} onClick={() => aksi({ jenis: 'siap' })}>
          {sudah ? 'Kamu sudah siap' : 'Sudah hafal, saya siap'}
        </button>
        {host && <button className="kedua" onClick={() => aksi({ jenis: 'mulaiDiskusi' })}>Mulai diskusi sekarang</button>}
      </div>
    </section>
  );
}

function Diskusi({ view, g, host, aksi }: PropsFase) {
  const giliranId = g.giliran < g.urutan.length ? g.urutan[g.giliran] : null;
  const selesai = giliranId === null;
  return (
    <section className="tumpuk">
      <div className="kartu">
        <h2>Ronde {g.ronde}: Diskusi</h2>
        <p className="catatan">Sesuai urutan, sebutkan satu petunjuk tentang kata kamu tanpa menyebut katanya.</p>
        <ol className="urutan">
          {g.urutan.map((id, k) => {
            const p = view.pemain.find((x) => x.id === id);
            return (
              <li key={id} className={k < g.giliran ? 'selesai' : k === g.giliran ? 'sekarang' : ''}>
                <span className="nomor">{k < g.giliran ? '✓' : k + 1}</span>
                <span className="nama">{p?.nama ?? '?'}{id === view.saya && <em> (kamu)</em>}</span>
                {p && !p.online && <span className="lencana off">Offline</span>}
              </li>
            );
          })}
        </ol>
      </div>
      {giliranId === view.saya ? (
        <div className="kartu sorot muncul" role="status">
          <h2>Giliran kamu!</h2>
          <p className="catatan">Sebutkan satu petunjuk dengan suara, lalu tekan Selesai bicara.</p>
        </div>
      ) : (
        <p className="menunggu" role="status">
          {selesai ? 'Semua sudah bicara. Host akan memulai voting.' : `Sekarang giliran ${namaDari(view, giliranId)}.`}
        </p>
      )}
      {g.hidup ? <KataSaya view={view} g={g} ringkas /> : <p className="catatan tengah-teks">Kamu sudah tereliminasi. Tetap boleh menonton.</p>}
      <div className="aksi-bawah">
        {giliranId === view.saya && <button className="utama" onClick={() => aksi({ jenis: 'selesaiBicara' })}>Selesai bicara</button>}
        {host && (
          <>
            {giliranId && giliranId !== view.saya && (
              <button className="kedua" onClick={() => aksi({ jenis: 'lewatiGiliran' })}>Lewati giliran {namaDari(view, giliranId)}</button>
            )}
            <button className={selesai ? 'utama' : 'kedua'} onClick={() => aksi({ jenis: 'mulaiVote' })}>Mulai voting</button>
          </>
        )}
      </div>
    </section>
  );
}

const ATURAN_SERI = 'Jika suara terbanyak seri, dilakukan vote ulang sekali hanya antara yang seri. Jika masih seri, tidak ada yang tereliminasi dan permainan lanjut ke ronde berikutnya.';

function Voting({ view, g, host, aksi }: PropsFase) {
  const hidup = pesertaDari(view).filter((p) => p.hidup);
  const pemilih = hidup.filter((p) => g.kandidat.some((k) => k !== p.id));
  const bisaVote = g.ikut && g.hidup && g.kandidat.some((k) => k !== view.saya);
  return (
    <section className="tumpuk">
      <div className="kartu">
        <h2>Ronde {g.ronde}: {g.putaranVote === 2 ? 'Vote ulang' : 'Voting'}</h2>
        {g.putaranVote === 2 ? (
          <p className="catatan">Suara seri antara {g.kandidat.map((id) => namaDari(view, id)).join(' dan ')}. Pilih salah satu dari mereka. Jika masih seri, tidak ada yang tereliminasi.</p>
        ) : (
          <p className="catatan">Pilih satu pemain yang paling dicurigai. Kamu bisa mengganti pilihan sampai voting ditutup.</p>
        )}
        {bisaVote ? (
          <div className="pilih-pemain">
            {g.kandidat.filter((id) => id !== view.saya).map((id) => (
              <button
                key={id}
                className={`pemain ${g.pilihanSaya === id ? 'pilih' : ''}`}
                aria-pressed={g.pilihanSaya === id}
                onClick={() => aksi({ jenis: 'vote', target: id })}
              >
                {namaDari(view, id)}
              </button>
            ))}
          </div>
        ) : (
          <p className="menunggu">{g.hidup ? 'Kamu tidak bisa memilih di vote ulang ini.' : 'Kamu sudah tereliminasi dan tidak ikut voting.'}</p>
        )}
      </div>
      <div className="kartu">
        <Progres nilai={g.sudahVote.filter((id) => pemilih.some((p) => p.id === id)).length} total={pemilih.length} label="Suara masuk" />
        <ul className="chip-grup kecil-jarak">
          {pemilih.map((p) => (
            <li key={p.id} className={`chip-status ${g.sudahVote.includes(p.id) ? 'ok' : ''} ${p.online ? '' : 'offline'}`}>
              {g.sudahVote.includes(p.id) ? '✓ ' : ''}{p.nama}
            </li>
          ))}
        </ul>
        <p className="catatan">Hasil keluar otomatis setelah semua suara masuk. {ATURAN_SERI}</p>
      </div>
      {host && (
        <div className="aksi-bawah">
          <button className="kedua" onClick={() => aksi({ jenis: 'tutupVote' })}>Tutup voting sekarang</button>
        </div>
      )}
    </section>
  );
}

function RekapSuara({ view, g }: { view: ViewPemain; g: GameView }) {
  if (!g.hasilVote) return null;
  const daftar = Object.entries(g.hasilVote.hitung).sort((a, b) => b[1] - a[1]);
  const maks = Math.max(1, ...daftar.map(([, n]) => n));
  return (
    <div className="kartu">
      <h2>Hasil suara</h2>
      <ul className="rekap">
        {daftar.map(([id, n]) => (
          <li key={id}>
            <span className="nama">{namaDari(view, id)}</span>
            <span className="bar"><span style={{ width: `${(n / maks) * 100}%` }} /></span>
            <strong>{n}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Terungkap({ view, g, host, aksi }: PropsFase) {
  const korban = view.pemain.find((p) => p.id === g.tereliminasi);
  return (
    <section className="tumpuk">
      {!korban ? (
        <div className="kartu besar muncul">
          <h1 className="kata">Tidak ada yang tereliminasi</h1>
          <p className="catatan">
            {g.hasilVote && g.hasilVote.seri.length > 0
              ? `Suara masih seri setelah vote ulang (${g.hasilVote.seri.map((id) => namaDari(view, id)).join(', ')}).`
              : 'Tidak ada suara yang masuk.'}{' '}
            Permainan lanjut ke ronde berikutnya.
          </p>
        </div>
      ) : (
        <div className={`kartu besar peran-${korban.peran ?? 'civilian'}`}>
          <p className="sub">{korban.id === view.saya ? 'Kamu tereliminasi. Peranmu:' : `${korban.nama} tereliminasi. Perannya:`}</p>
          <h1 className="kata ungkap">{korban.peran ? NAMA_PERAN[korban.peran] : '?'}</h1>
          {g.tebakan === 'menunggu' && (korban.id === view.saya ? (
            <TebakMrWhite onTebak={(teks) => aksi({ jenis: 'tebak', teks })} />
          ) : (
            <p className="menunggu">Menunggu {korban.nama} menebak kata Civilian...</p>
          ))}
          {g.tebakan === 'salah' && (
            <p className="catatan">{g.tebakanSalah ? `Tebakan Mr. White salah: “${g.tebakanSalah}”.` : 'Mr. White tidak menebak.'} Permainan berlanjut.</p>
          )}
        </div>
      )}
      <RekapSuara view={view} g={g} />
      <div className="aksi-bawah">
        {host ? (
          <>
            {g.tebakan === 'menunggu' && <button className="kedua" onClick={() => aksi({ jenis: 'lewatiTebakan' })}>Lewati tebakan</button>}
            <button className="utama" disabled={g.tebakan === 'menunggu'} onClick={() => aksi({ jenis: 'lanjut' })}>Lanjut</button>
          </>
        ) : (
          g.tebakan !== 'menunggu' && <p className="menunggu">Menunggu host melanjutkan...</p>
        )}
      </div>
    </section>
  );
}

function TebakMrWhite({ onTebak }: { onTebak: (t: string) => void }) {
  const [teks, setTeks] = useState('');
  return (
    <form
      className="tebak"
      onSubmit={(e) => {
        e.preventDefault();
        if (teks.trim()) onTebak(teks.trim());
      }}
    >
      <label htmlFor="tebakan-online">Tebak kata Civilian. Kalau benar, Mr. White menang!</label>
      <input id="tebakan-online" value={teks} maxLength={60} onChange={(e) => setTeks(e.target.value)} autoComplete="off" autoCapitalize="off" placeholder="Ketik tebakan" />
      <button className="utama" type="submit" disabled={!teks.trim()}>Tebak</button>
    </form>
  );
}

function Penonton({ view, g }: PropsFase) {
  const fase: Record<string, string> = { kata: 'membaca kata', diskusi: 'diskusi', vote: 'voting', terungkap: 'membuka peran' };
  return (
    <section className="tumpuk tengah">
      <div className="kartu besar">
        <h1 className="nama-besar">Kamu menonton</h1>
        <p>Permainan sedang berjalan (ronde {g.ronde}, {fase[g.fase] ?? g.fase}).</p>
        <p className="catatan">Kamu otomatis ikut di permainan berikutnya.</p>
      </div>
      <DaftarPemain view={view} host={false} aksi={() => undefined} />
    </section>
  );
}

function Hasil({ view, g, host, aksi, mulaiGame, memuat }: PropsFase) {
  const h = g.hasil;
  if (!h) return null;
  const peserta = pesertaDari(view);
  const sayaMenang = (() => {
    const p = peserta.find((x) => x.id === view.saya);
    if (!p?.peran) return false;
    return h.pemenang === 'civilian' ? p.peran === 'civilian' : h.pemenang === 'mrwhite' ? p.peran === 'mrwhite' : p.peran !== 'civilian';
  })();
  return (
    <section className="tumpuk">
      <Konfeti />
      <div className={`kartu besar menang-${h.pemenang} muncul`}>
        {g.ikut && <p className="sub">{sayaMenang ? 'Kamu menang!' : 'Kamu kalah kali ini.'}</p>}
        <h1 className="kata ungkap">{JUDUL_MENANG[h.pemenang]}</h1>
        {h.pemenang === 'mrwhite' && <p className="catatan">Mr. White menebak kata Civilian dengan benar: “{h.tebakanMrWhite}”.</p>}
        {h.pemenang === 'penyusup' && <p className="catatan">Undercover dan Mr. White berhasil bertahan.</p>}
        {h.pemenang === 'civilian' && <p className="catatan">Semua Undercover dan Mr. White sudah tertangkap.</p>}
        <div className="kata-hasil">
          <div><span>Kata Civilian</span><strong>{h.pasangan.civilian}</strong></div>
          <div><span>Kata Undercover</span><strong>{h.pasangan.undercover}</strong></div>
        </div>
        <p className="catatan kecil-teks">Sumber: {h.pasangan.sumber}</p>
      </div>
      <div className="kartu">
        <h2>Peran semua pemain</h2>
        <ul className="daftar-hasil">
          {peserta.map((p, i) => (
            <li key={p.id} className={`${p.hidup ? '' : 'mati'} muncul`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <span>{p.nama}</span>
              {p.peran && <span className={`lencana ${p.peran}`}>{NAMA_PERAN[p.peran]}</span>}
              <span className="poin">{angka(view.skor[p.nama] ?? 0)} poin</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="aksi-bawah">
        {host ? (
          <>
            <button className="utama" disabled={memuat} onClick={mulaiGame}>{memuat ? 'Menyiapkan kata...' : 'Main lagi'}</button>
            <button className="kedua" onClick={() => aksi({ jenis: 'keLobby' })}>Kembali ke lobby</button>
          </>
        ) : (
          <p className="menunggu">Menunggu host memulai permainan berikutnya...</p>
        )}
      </div>
    </section>
  );
}
