'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  bagiPeran, cekPemenang, eliminasi, kataUntuk, komposisiDefault,
  MAX_PEMAIN, MIN_PEMAIN, namaDefault, tebakanBenar, urutanBicara,
  rapikanPanjangKata, validasiSetup, type Komposisi,
} from '@/lib/game';
import { kategoriTersimpan, PESAN_TANPA_SATU_KATA, siapkanPasangan } from '@/lib/bankKata';
import { baca, KUNCI, simpan } from '@/lib/storage';
import type { PanjangKata, PasanganKata, Pemain, Pemenang } from '@/lib/types';
import { cekPetunjuk, type EntriPetunjuk } from '@/lib/petunjuk';
import { useDialog } from './Modal';
import { FormPetunjuk, RiwayatPetunjuk } from './Petunjuk';
import { AturPeran, JUDUL_MENANG, KartuBalik, KepalaFase, Konfeti, NAMA_PERAN, PilihKategori, PilihPanjangKata, Stepper, TombolMenu, type Penjaga } from './ui';

const PILIHAN_TIMER = [0, 60, 90, 120, 180];

type Fase =
  | { jenis: 'serah'; idx: number; terbuka: boolean }
  | { jenis: 'diskusi'; ronde: number; urutan: number[]; giliran: number }
  | { jenis: 'vote'; ronde: number; pilih: number | null }
  | { jenis: 'terungkap'; ronde: number; idx: number; tebakan: 'belum' | 'salah' }
  | { jenis: 'hasil'; pemenang: Pemenang; tebakanMrWhite?: string };

interface Permainan {
  pemain: Pemain[];
  pasangan: PasanganKata;
  fase: Fase;
  /** Petunjuk yang sudah diketik. `pemain` berisi indeks pemain sebagai string. */
  petunjuk: EntriPetunjuk[];
}

type Layar = 'setup' | 'caramain' | 'main';

function namaAwal(): string[] {
  const n = baca<string[]>(KUNCI.nama, []);
  return Array.isArray(n) && n.length >= MIN_PEMAIN && n.length <= MAX_PEMAIN
    ? n.map(String)
    : Array.from({ length: 5 }, (_, i) => namaDefault(i));
}

function komposisiAwal(jumlah: number): Komposisi {
  const k = baca<Komposisi | null>(KUNCI.komposisi, null);
  const nama = Array.from({ length: jumlah }, (_, i) => namaDefault(i));
  return k && validasiSetup(nama, k).length === 0 ? k : komposisiDefault(jumlah);
}

export default function UndercoverGame({ onBeranda, daftarPenjaga }: { onBeranda?: () => void; daftarPenjaga?: (p: Penjaga | null) => void }) {
  const dialog = useDialog();
  const [layar, setLayar] = useState<Layar>('setup');
  const [nama, setNama] = useState<string[]>(namaAwal);
  const [komposisi, setKomposisi] = useState<Komposisi>(() => komposisiAwal(namaAwal().length));
  const [kategori, setKategori] = useState<string[]>(kategoriTersimpan);
  const [timer, setTimer] = useState<number>(() => baca<number>(KUNCI.timer, 0));
  const [panjangKata, setPanjangKata] = useState<PanjangKata>(() => rapikanPanjangKata(baca<unknown>(KUNCI.panjangKata, null)));
  const [game, setGame] = useState<Permainan | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);

  // Pilihan kategori langsung disimpan, jadi kategori yang dibuang tetap dibuang di kunjungan berikutnya.
  useEffect(() => simpan(KUNCI.kategori, kategori), [kategori]);

  // Kembali ke menu saat permainan berjalan harus dikonfirmasi lewat modal.
  const penjaga = useCallback(async () => {
    if (layar !== 'main' || !game) return true;
    return dialog.konfirmasi({
      judul: 'Kembali ke menu?',
      pesan: 'Permainan ini dihentikan dan kamu kembali ke menu Lokal atau Online.',
      ok: 'Ke menu',
      batal: 'Lanjut',
      bahaya: true,
    });
  }, [layar, game, dialog]);
  useEffect(() => {
    daftarPenjaga?.(penjaga);
    return () => daftarPenjaga?.(null);
  }, [penjaga, daftarPenjaga]);

  const galat = useMemo(() => {
    const g = validasiSetup(nama, komposisi);
    if (kategori.length === 0) g.push('Pilih minimal 1 kategori kata.');
    return g;
  }, [nama, komposisi, kategori]);

  function ubahJumlah(delta: number) {
    const n = Math.max(MIN_PEMAIN, Math.min(MAX_PEMAIN, nama.length + delta));
    if (n === nama.length) return;
    const baru = n > nama.length
      ? [...nama, ...Array.from({ length: n - nama.length }, (_, i) => namaDefault(nama.length + i))]
      : nama.slice(0, n);
    setNama(baru);
    setKomposisi(komposisiDefault(n));
  }

  async function mulai() {
    if (galat.length > 0) return;
    setMemuat(true);
    setGalatMuat(null);
    try {
      const { pasangan, cadangan } = await siapkanPasangan(kategori, panjangKata);
      const bersih = nama.map((n) => n.trim());
      simpan(KUNCI.nama, bersih);
      simpan(KUNCI.komposisi, komposisi);
      simpan(KUNCI.kategori, kategori);
      simpan(KUNCI.timer, timer);
      simpan(KUNCI.panjangKata, panjangKata);
      setNama(bersih);
      setGame({ pemain: bagiPeran(bersih, komposisi), pasangan, fase: { jenis: 'serah', idx: 0, terbuka: false }, petunjuk: [] });
      setLayar('main');
      if (cadangan) void dialog.info({ judul: 'Pasangan satu kata tidak ada', pesan: PESAN_TANPA_SATU_KATA });
    } catch {
      setGalatMuat('Gagal memuat bank kata. Periksa koneksi lalu coba lagi.');
    } finally {
      setMemuat(false);
    }
  }

  function selesai(pemain: Pemain[], pemenang: Pemenang, tebakanMrWhite?: string) {
    setGame((g) => (g ? { ...g, pemain, fase: { jenis: 'hasil', pemenang, tebakanMrWhite } } : g));
  }

  function lanjutSetelahEliminasi(pemain: Pemain[], ronde: number) {
    const pemenang = cekPemenang(pemain);
    if (pemenang) return selesai(pemain, pemenang);
    setGame((g) => (g ? { ...g, pemain, fase: { jenis: 'diskusi', ronde: ronde + 1, urutan: urutanBicara(pemain), giliran: 0 } } : g));
  }

  /** Selesaikan giliran saat ini (dengan petunjuk, atau tanpa entri untuk Sudah bicara / Lewati), lalu otomatis ke voting setelah giliran terakhir. */
  function majuGiliran(teks: string | null) {
    setGame((g) => {
      if (!g || g.fase.jenis !== 'diskusi') return g;
      const f = g.fase;
      const petunjuk = teks === null ? g.petunjuk : [...g.petunjuk, { pemain: String(f.urutan[f.giliran]), ronde: f.ronde, teks, waktu: Date.now() }];
      const giliran = f.giliran + 1;
      const fase: Fase = giliran >= f.urutan.length ? { jenis: 'vote', ronde: f.ronde, pilih: null } : { ...f, giliran };
      return { ...g, petunjuk, fase };
    });
  }

  return (
    <main className="wadah">
      <header className="kepala">
        {onBeranda && <TombolMenu onClick={onBeranda} />}
        {layar !== 'main' ? (
          <nav className="navigasi">
            <button className={layar === 'caramain' ? 'aktif' : ''} onClick={() => setLayar(layar === 'caramain' ? 'setup' : 'caramain')}>Aturan</button>
          </nav>
        ) : (
          <button
            className="kecil"
            onClick={async () => {
              const ya = await dialog.konfirmasi({
                judul: 'Akhiri permainan?',
                pesan: 'Permainan ini dihentikan dan kamu kembali ke pengaturan.',
                ok: 'Akhiri',
                batal: 'Lanjut',
                bahaya: true,
              });
              if (ya) {
                setGame(null);
                setLayar('setup');
              }
            }}
          >
            Keluar
          </button>
        )}
      </header>

      {layar === 'caramain' && <CaraMain onTutup={() => setLayar('setup')} />}
      
      {layar === 'setup' && (
        <section className="tumpuk masuk">
          <div className="kartu">
            <div className="baris-judul">
              <h2>Pemain</h2>
              <Stepper nilai={nama.length} min={MIN_PEMAIN} max={MAX_PEMAIN} onUbah={ubahJumlah} label="jumlah pemain" />
            </div>
            <ol className="daftar-nama">
              {nama.map((n, i) => (
                <li key={i}>
                  <span className="nomor">{i + 1}</span>
                  <input
                    value={n}
                    maxLength={20}
                    aria-label={`Nama pemain ${i + 1}`}
                    placeholder={namaDefault(i)}
                    onChange={(e) => setNama((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                    onFocus={(e) => e.target.select()}
                  />
                </li>
              ))}
            </ol>
          </div>

          <AturPeran
            jumlah={nama.length}
            komposisi={komposisi}
            onUbah={setKomposisi}
            onOtomatis={() => setKomposisi(komposisiDefault(nama.length))}
          />

          <PilihKategori kategori={kategori} onUbah={setKategori} panjangKata={panjangKata} />

          <PilihPanjangKata nilai={panjangKata} onUbah={setPanjangKata} />

          <div className="kartu">
            <div className="baris-judul">
              <h2>Timer</h2>
            </div>
            <div className="chip-grup">
              {PILIHAN_TIMER.map((d) => (
                <button key={d} className={`chip ${timer === d ? 'pilih' : ''}`} aria-pressed={timer === d} onClick={() => setTimer(d)}>
                  {d === 0 ? 'Mati' : `${d / 60 >= 1 && d % 60 === 0 ? `${d / 60} menit` : `${d} detik`}`}
                </button>
              ))}
            </div>
          </div>

          {galat.length > 0 && (
            <ul className="galat" role="alert">
              {galat.map((g) => <li key={g}>{g}</li>)}
            </ul>
          )}
          {galatMuat && <p className="galat" role="alert">{galatMuat}</p>}
          <div className="aksi-bawah">
            <button className="utama" disabled={galat.length > 0 || memuat} onClick={mulai}>
              {memuat ? 'Memuat' : 'Mulai'}
            </button>
          </div>
        </section>
      )}

      {layar === 'main' && game && (
        <div key={kunciFase(game.fase)} className="masuk">
        <LayarMain
          game={game}
          timer={timer}
          setFase={(fase) => setGame((g) => (g ? { ...g, fase } : g))}
          onEliminasi={(idx, ronde) =>
            setGame((g) => (g ? { ...g, pemain: eliminasi(g.pemain, idx), fase: { jenis: 'terungkap', ronde, idx, tebakan: 'belum' } } : g))
          }
          onTebak={(teks) => {
            if (tebakanBenar(teks, game.pasangan.civilian)) selesai(game.pemain, 'mrwhite', teks.trim());
            else setGame((g) => (g && g.fase.jenis === 'terungkap' ? { ...g, fase: { ...g.fase, tebakan: 'salah' } } : g));
          }}
          onLanjut={(ronde) => lanjutSetelahEliminasi(game.pemain, ronde)}
          onGiliran={majuGiliran}
          onMainLagi={mulai}
          onAturUlang={() => {
            setGame(null);
            setLayar('setup');
          }}
          memuat={memuat}
        />
        </div>
      )}
    </main>
  );
}

function kunciFase(f: Fase): string {
  if (f.jenis === 'serah') return `serah-${f.idx}`;
  if (f.jenis === 'hasil') return 'hasil';
  return `${f.jenis}-${f.ronde}`;
}

interface PropsMain {
  game: Permainan;
  timer: number;
  setFase: (f: Fase) => void;
  onEliminasi: (idx: number, ronde: number) => void;
  onTebak: (teks: string) => void;
  onLanjut: (ronde: number) => void;
  onGiliran: (teks: string | null) => void;
  onMainLagi: () => void;
  onAturUlang: () => void;
  memuat: boolean;
}

function LayarMain({ game, timer, setFase, onEliminasi, onTebak, onLanjut, onGiliran, onMainLagi, onAturUlang, memuat }: PropsMain) {
  const { pemain, pasangan, fase } = game;
  const riwayat = (tampilPeran: boolean, giliran?: number) => (
    <RiwayatPetunjuk
      pemain={pemain.map((p, i) => ({ kunci: String(i), nama: p.nama, hidup: p.hidup, peran: tampilPeran || !p.hidup ? p.peran : undefined }))}
      entri={game.petunjuk}
      giliran={giliran === undefined ? null : String(giliran)}
      ronde={fase.jenis === 'diskusi' || fase.jenis === 'vote' || fase.jenis === 'terungkap' ? fase.ronde : Math.max(1, ...game.petunjuk.map((e) => e.ronde))}
    />
  );

  if (fase.jenis === 'serah') {
    const p = pemain[fase.idx];
    const kata = kataUntuk(p, pasangan);
    const terakhir = fase.idx === pemain.length - 1;
    return (
      <section className="tumpuk tengah">
        <p className="langkah">{fase.idx + 1}/{pemain.length}</p>
        <KartuBalik
          terbuka={fase.terbuka}
          depan={
            <>
              <p className="sub">Oper ke</p>
              <h1 className="nama-besar">{p.nama}</h1>
              <p className="catatan">Jangan sampai terlihat pemain lain.</p>
              <button className="utama" onClick={() => setFase({ ...fase, terbuka: true })}>Lihat</button>
            </>
          }
          belakang={
            <>
              <p className="sub">{p.nama}</p>
              {kata ? (
                <h1 className="kata">{kata}</h1>
              ) : (
                <>
                  <h1 className="kata">Mr. White</h1>
                  <p className="catatan">Kamu tanpa kata. Berbaurlah.</p>
                </>
              )}
              <button
                className="utama"
                onClick={() =>
                  terakhir
                    ? setFase({ jenis: 'diskusi', ronde: 1, urutan: urutanBicara(pemain), giliran: 0 })
                    : setFase({ jenis: 'serah', idx: fase.idx + 1, terbuka: false })
                }
              >
                {terakhir ? 'Diskusi' : 'Lanjut'}
              </button>
            </>
          }
        />
      </section>
    );
  }

  if (fase.jenis === 'diskusi') {
    return <GiliranPetunjuk key={`${fase.ronde}-${fase.giliran}`} game={game} fase={fase} onGiliran={onGiliran} onVote={() => setFase({ jenis: 'vote', ronde: fase.ronde, pilih: null })} riwayat={riwayat(false, fase.urutan[fase.giliran])} />;
  }

  if (fase.jenis === 'vote') {
    return (
      <section className="tumpuk">
        <div className="kartu">
          <KepalaFase judul="Vote" ronde={fase.ronde} />
          <div className="pilih-pemain">
            {pemain.map((p, i) =>
              p.hidup ? (
                <button key={i} className={`pemain ${fase.pilih === i ? 'pilih' : ''}`} aria-pressed={fase.pilih === i} onClick={() => setFase({ ...fase, pilih: i })}>
                  {p.nama}
                </button>
              ) : null,
            )}
          </div>
        </div>
        {timer > 0 && <Timer key={fase.ronde} detik={timer} />}
        {riwayat(false)}
        <div className="aksi-bawah">
          <button className="utama bahaya" disabled={fase.pilih === null} onClick={() => fase.pilih !== null && onEliminasi(fase.pilih, fase.ronde)}>
            {fase.pilih === null ? 'Pilih' : `Eliminasi ${pemain[fase.pilih].nama}`}
          </button>
        </div>
      </section>
    );
  }

  if (fase.jenis === 'terungkap') {
    const p = pemain[fase.idx];
    return (
      <section className="tumpuk tengah">
        <div className={`kartu besar peran-${p.peran}`}>
          <p className="sub">{p.nama} tereliminasi</p>
          <h1 className="kata ungkap">{NAMA_PERAN[p.peran]}</h1>
          {p.peran === 'mrwhite' && fase.tebakan === 'belum' ? (
            <TebakMrWhite nama={p.nama} onTebak={onTebak} />
          ) : (
            <>
              {fase.tebakan === 'salah' && <p className="catatan">Tebakan salah.</p>}
              <button className="utama" onClick={() => onLanjut(fase.ronde)}>Lanjut</button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="tumpuk">
      <Konfeti />
      <div className={`kartu besar menang-${fase.pemenang} muncul`}>
        <h1 className="kata ungkap">{JUDUL_MENANG[fase.pemenang]}</h1>
        {fase.pemenang === 'mrwhite' && <p className="catatan">Tebakan benar: “{fase.tebakanMrWhite}”</p>}
        <div className="kata-hasil">
          <div><span>Civilian</span><strong>{pasangan.civilian}</strong></div>
          <div><span>Undercover</span><strong>{pasangan.undercover}</strong></div>
        </div>
        <p className="catatan kecil-teks">Sumber: {pasangan.sumber}</p>
      </div>
      <div className="kartu">
        <h2>Peran</h2>
        <ul className="daftar-hasil">
          {pemain.map((p, i) => (
            <li key={i} className={p.hidup ? '' : 'mati'}>
              <span>{p.nama}</span>
              <span className={`lencana ${p.peran}`}>{NAMA_PERAN[p.peran]}</span>
            </li>
          ))}
        </ul>
      </div>
      {riwayat(true)}
      <div className="aksi-bawah">
        <button className="utama" onClick={onMainLagi} disabled={memuat}>{memuat ? 'Memuat' : 'Ulang'}</button>
        <button className="kedua" onClick={onAturUlang}>Atur</button>
      </div>
    </section>
  );
}

function GiliranPetunjuk({ game, fase, onGiliran, onVote, riwayat }: {
  game: Permainan;
  fase: Extract<Fase, { jenis: 'diskusi' }>;
  onGiliran: (teks: string | null) => void;
  onVote: () => void;
  riwayat: ReactNode;
}) {
  const [galat, setGalat] = useState<string | null>(null);
  const idx = fase.urutan[fase.giliran];
  const p = game.pemain[idx];
  const kirim = (teks: string) => {
    const r = cekPetunjuk(teks, kataUntuk(p, game.pasangan), game.petunjuk.map((e) => e.teks));
    if ('galat' in r) setGalat(r.galat);
    else onGiliran(r.teks);
  };
  return (
    <section className="tumpuk">
      <div className="kartu">
        <KepalaFase judul="Diskusi" ronde={fase.ronde} />
        <ol className="urutan">
          {fase.urutan.map((i, k) => (
            <li key={i} className={k < fase.giliran ? 'selesai' : k === fase.giliran ? 'sekarang' : ''}>
              <span className="nomor">{k < fase.giliran ? '✓' : k + 1}</span> {game.pemain[i].nama}
            </li>
          ))}
        </ol>
      </div>
      <FormPetunjuk
        judul={`Giliran ${p.nama}`}
        galat={galat}
        onUbah={() => setGalat(null)}
        onKirim={kirim}
        onSudahBicara={() => onGiliran(null)}
      />
      {riwayat}
      <div className="aksi-bawah">
        <div className="baris-tombol">
          <button className="kedua" onClick={() => onGiliran(null)}>Skip</button>
          <button className="kedua" onClick={onVote}>Vote</button>
        </div>
      </div>
    </section>
  );
}

function TebakMrWhite({ nama, onTebak }: { nama: string; onTebak: (t: string) => void }) {
  const [teks, setTeks] = useState('');
  return (
    <form
      className="tebak"
      onSubmit={(e) => {
        e.preventDefault();
        if (teks.trim()) onTebak(teks);
      }}
    >
      <label htmlFor="tebakan">{nama}, tebak kata Civilian. Benar berarti menang.</label>
      <input id="tebakan" value={teks} onChange={(e) => setTeks(e.target.value)} autoComplete="off" autoCapitalize="off" placeholder="Tebakan" />
      <button className="utama" type="submit" disabled={!teks.trim()}>Tebak</button>
    </form>
  );
}

function Timer({ detik }: { detik: number }) {
  const [sisa, setSisa] = useState(detik);
  const [jalan, setJalan] = useState(false);
  useEffect(() => {
    if (!jalan) return;
    const id = window.setInterval(() => {
      setSisa((s) => {
        if (s <= 1) {
          setJalan(false);
          if ('vibrate' in navigator) navigator.vibrate?.(300);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [jalan]);
  const mm = String(Math.floor(sisa / 60)).padStart(2, '0');
  const ss = String(sisa % 60).padStart(2, '0');
  return (
    <div className={`kartu timer ${sisa === 0 ? 'habis' : ''}`}>
      <output className="waktu" aria-live="off">{mm}:{ss}</output>
      <div className="baris-tombol">
        {sisa > 0 && <button className="kedua" onClick={() => setJalan((j) => !j)}>{jalan ? 'Jeda' : 'Mulai'}</button>}
        <button className="kedua" onClick={() => { setJalan(false); setSisa(detik); }}>Ulang</button>
      </div>
      {sisa === 0 && <p className="catatan">Habis</p>}
    </div>
  );
}

function CaraMain({ onTutup }: { onTutup: () => void }) {
  return (
    <section className="tumpuk">
      <div className="kartu teks">
        <h2>Aturan</h2>
        <p>Undercover dimainkan 3 sampai 20 orang. Pilih Lokal (satu HP dioper bergiliran) atau Online (setiap pemain memakai HP sendiri lewat kode room).</p>
        <h3>Peran</h3>
        <ul>
          <li><strong>Civilian</strong>: mayoritas, semua mendapat kata yang sama.</li>
          <li><strong>Undercover</strong>: mendapat kata yang mirip tapi berbeda. Undercover tidak tahu bahwa dirinya Undercover.</li>
          <li><strong>Mr. White</strong>: tidak mendapat kata sama sekali dan harus berpura-pura tahu.</li>
        </ul>
        <h3>Alur</h3>
        <ol>
          <li>Atur pemain, jumlah peran, dan kategori kata, lalu tekan Mulai.</li>
          <li>Oper HP ke setiap pemain. Tekan untuk melihat kata, hafalkan, lalu tutup sebelum mengoper.</li>
          <li>Petunjuk: sesuai urutan, setiap pemain mengetik satu petunjuk singkat (maksimal 30 karakter) tentang katanya tanpa menyebut kata itu. Petunjuk yang sama dengan kata rahasia atau yang sudah dipakai ditolak. Semua petunjuk tercatat di riwayat per pemain dan per ronde. Tombol Sudah bicara menyelesaikan giliran tanpa mencatat apa pun ke riwayat.</li>
          <li>Voting: baca riwayat petunjuk, lalu pilih satu pemain yang paling dicurigai. Perannya langsung dibuka.</li>
          <li>Jika Mr. White tereliminasi, dia boleh menebak kata Civilian. Tebakan benar berarti Mr. White menang.</li>
        </ol>
        <h3>Menang</h3>
        <ul>
          <li>Civilian menang jika semua Undercover dan Mr. White tereliminasi.</li>
          <li>Penyusup (Undercover dan Mr. White) menang jika jumlah mereka yang tersisa sama atau lebih banyak dari Civilian, termasuk saat tinggal 2 pemain.</li>
        </ul>
        <h3>Online</h3>
        <ul>
          <li>Satu orang membuat room dan menjadi host. Pemain lain gabung dengan kode, link, atau QR.</li>
          <li>Setiap pemain melihat katanya sendiri di HP masing-masing, lalu mengetik petunjuk bergiliran sesuai urutan di layar. Pemain lain melihat tulisan Menunggu [nama] dan riwayat petunjuk yang diperbarui langsung. Setelah semua mendapat giliran, voting dimulai otomatis.</li>
          <li>Voting dilakukan dari HP masing-masing. Jika suara terbanyak seri, ada vote ulang sekali antara yang seri. Jika masih seri, tidak ada yang tereliminasi.</li>
          <li>HP host harus tetap membuka halaman selama permainan.</li>
        </ul>
        <p className="catatan">Semua data (nama, pengaturan, riwayat kata) hanya disimpan di HP ini. Tidak ada login dan tidak ada pelacakan. Di mode online, HP saling terhubung langsung (WebRTC); server perantara PeerJS hanya dipakai untuk saling menemukan.</p>
      </div>
      <div className="aksi-bawah">
        <button className="utama" onClick={onTutup}>Oke</button>
      </div>
    </section>
  );
}
