'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  bagiPeran, cekPemenang, eliminasi, kataUntuk, komposisiDefault,
  MAX_PEMAIN, MIN_PEMAIN, namaDefault, tebakanBenar, urutanBicara,
  rapikanPanjangKata, validasiSetup, type Komposisi,
} from '@/lib/game';
import { kategoriTersimpan, kunciKategori, PESAN_TANPA_SATU_KATA, siapkanPasangan, sumberTersimpan } from '@/lib/bankKata';
import { baca, KUNCI, simpan } from '@/lib/storage';
import type { PanjangKata, PasanganKata, Pemain, Pemenang, SumberKata } from '@/lib/types';
import { cekPetunjuk, teksDipakai, type EntriPetunjuk } from '@/lib/petunjuk';
import { batasTersimpan, detikTebakan, TEKS_WAKTU_HABIS, type BatasWaktu } from '@/lib/batasWaktu';
import { peristiwaLokal } from '@/lib/umpan/peristiwa';
import { umpan } from '@/lib/umpan/mesin';
import { useDialog } from './Modal';
import { TombolSuara } from './PanelSuara';
import { DaftarPetunjuk, FormPetunjuk, KartuVote, LembarPetunjuk, petunjukMilik, RiwayatPetunjuk } from './Petunjuk';
import { AturPeran, JUDUL_MENANG, KartuBalik, KepalaFase, Konfeti, NAMA_PERAN, PilihBatasWaktu, PilihKategori, PilihPanjangKata, PilihSumberKata, Stepper, TombolMenu, type Penjaga } from './ui';
import { Hitungan } from './Hitungan';

/** Jeda singkat setelah waktu petunjuk habis agar pemain sempat melihat tanda sebelum giliran pindah. */
const JEDA_HABIS_MS = 1200;

type Fase =
  | { jenis: 'serah'; idx: number; terbuka: boolean }
  | { jenis: 'diskusi'; ronde: number; urutan: number[]; giliran: number }
  /** pilih: indeks pemain, LEWATI_LOKAL untuk abstain, atau null jika belum memilih. */
  | { jenis: 'vote'; ronde: number; pilih: number | null }
  | { jenis: 'terungkap'; ronde: number; idx: number; tebakan: 'belum' | 'salah'; habis?: boolean }
  /** Vote dilewati: tidak ada yang tereliminasi, lanjut ronde berikutnya. */
  | { jenis: 'aman'; ronde: number }
  | { jenis: 'hasil'; pemenang: Pemenang; tebakanMrWhite?: string };

/** Pilihan vote untuk melewati eliminasi di mode satu HP. */
const LEWATI_LOKAL = -1;

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
  const [sumber, setSumber] = useState<SumberKata>(sumberTersimpan);
  // Pilihan kategori disimpan terpisah per sumber kata, bawaan semua kategori.
  const [kategoriPerSumber, setKategoriPerSumber] = useState<Record<SumberKata, string[]>>(() => ({
    internet: kategoriTersimpan('internet'),
    kamus: kategoriTersimpan('kamus'),
  }));
  const kategori = kategoriPerSumber[sumber];
  const setKategori = (k: string[]) => setKategoriPerSumber((lama) => ({ ...lama, [sumber]: k }));
  const [batas, setBatas] = useState<BatasWaktu>(batasTersimpan);
  const [panjangKata, setPanjangKata] = useState<PanjangKata>(() => rapikanPanjangKata(baca<unknown>(KUNCI.panjangKata, null)));
  const [game, setGame] = useState<Permainan | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);

  // Pilihan kategori langsung disimpan, jadi kategori yang dibuang tetap dibuang di kunjungan berikutnya.
  useEffect(() => simpan(kunciKategori(sumber), kategori), [sumber, kategori]);
  useEffect(() => simpan(KUNCI.sumberKata, sumber), [sumber]);

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
      const { pasangan, cadangan } = await siapkanPasangan(kategori, panjangKata, sumber);
      const bersih = nama.map((n) => n.trim());
      simpan(KUNCI.nama, bersih);
      simpan(KUNCI.komposisi, komposisi);
      simpan(KUNCI.sumberKata, sumber);
      simpan(kunciKategori(sumber), kategori);
      simpan(KUNCI.batasWaktu, batas);
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
  function majuGiliran(teks: string | null, habis = false) {
    setGame((g) => {
      if (!g || g.fase.jenis !== 'diskusi') return g;
      const f = g.fase;
      const entri: EntriPetunjuk | null = habis
        ? { pemain: String(f.urutan[f.giliran]), ronde: f.ronde, teks: TEKS_WAKTU_HABIS, waktu: Date.now(), habis: true }
        : teks === null ? null : { pemain: String(f.urutan[f.giliran]), ronde: f.ronde, teks, waktu: Date.now() };
      const petunjuk = entri ? [...g.petunjuk, entri] : g.petunjuk;
      const giliran = f.giliran + 1;
      const fase: Fase = giliran >= f.urutan.length ? { jenis: 'vote', ronde: f.ronde, pilih: null } : { ...f, giliran };
      return { ...g, petunjuk, fase };
    });
  }

  const dok = layar === 'main' && game && game.fase.jenis !== 'serah' && (game.fase.jenis !== 'hasil' || game.petunjuk.length > 0);
  return (
    <main className={`wadah${dok ? ' punya-dok' : ''}`}>
      <header className="kepala">
        {onBeranda && <TombolMenu onClick={onBeranda} />}
        <div className="aksi-kepala">
          <TombolSuara />
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
        </div>
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

          <PilihSumberKata nilai={sumber} onUbah={setSumber} />

          <PilihKategori kategori={kategori} onUbah={setKategori} panjangKata={panjangKata} sumber={sumber} />

          <PilihPanjangKata nilai={panjangKata} onUbah={setPanjangKata} />

          <PilihBatasWaktu
            nilai={batas}
            onUbah={(b) => {
              setBatas(b);
              simpan(KUNCI.batasWaktu, b);
            }}
            mode="lokal"
          />

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
          batas={batas}
          setFase={(fase) => setGame((g) => (g ? { ...g, fase } : g))}
          onEliminasi={(idx, ronde) =>
            setGame((g) => (g ? { ...g, pemain: eliminasi(g.pemain, idx), fase: { jenis: 'terungkap', ronde, idx, tebakan: 'belum' } } : g))
          }
          onTebak={(teks) => {
            if (tebakanBenar(teks, game.pasangan.civilian)) selesai(game.pemain, 'mrwhite', teks.trim());
            else setGame((g) => (g && g.fase.jenis === 'terungkap' ? { ...g, fase: { ...g.fase, tebakan: 'salah' } } : g));
          }}
          onTebakHabis={() =>
            setGame((g) => (g && g.fase.jenis === 'terungkap' && g.fase.tebakan === 'belum' ? { ...g, fase: { ...g.fase, tebakan: 'salah', habis: true } } : g))
          }
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
      {dok && game && (
        // Dok bawah: tombol Petunjuk tetap di tempat saat digulir, di bawah tombol aksi.
        <nav className="dok" aria-label="Petunjuk">
          <div className="dok-isi">
            <LembarPetunjuk {...propsRiwayatLokal(game, game.fase.jenis === 'hasil')} />
          </div>
        </nav>
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
  batas: BatasWaktu;
  setFase: (f: Fase) => void;
  onEliminasi: (idx: number, ronde: number) => void;
  onTebak: (teks: string) => void;
  /** Waktu tebakan Mr. White habis: dianggap salah. */
  onTebakHabis: () => void;
  onLanjut: (ronde: number) => void;
  onGiliran: (teks: string | null, habis?: boolean) => void;
  onMainLagi: () => void;
  onAturUlang: () => void;
  memuat: boolean;
}

function LayarMain({ game, batas, setFase, onEliminasi, onTebak, onTebakHabis, onLanjut, onGiliran, onMainLagi, onAturUlang, memuat }: PropsMain) {
  const { pemain, pasangan, fase } = game;
  // Isyarat suara/getar mode lokal; giliran berikutnya diberi bunyi yang jelas karena HP dioper.
  const isyarat = peristiwaLokal(fase);
  const isyaratLalu = useRef<string | null>(null);
  useEffect(() => {
    if (isyarat.kunci === isyaratLalu.current) return;
    isyaratLalu.current = isyarat.kunci;
    umpan(isyarat.p);
  }, [isyarat.kunci, isyarat.p]);
  const riwayat = (tampilPeran: boolean) => <RiwayatPetunjuk {...propsRiwayatLokal(game, tampilPeran)} />;

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
    return <GiliranPetunjuk key={`${fase.ronde}-${fase.giliran}`} game={game} fase={fase} detik={batas.petunjuk} onGiliran={onGiliran} onVote={() => setFase({ jenis: 'vote', ronde: fase.ronde, pilih: null })} daftar={<DaftarPetunjuk {...propsRiwayatLokal(game, false)} giliranKe={fase.giliran} />} />;
  }

  if (fase.jenis === 'vote') {
    return (
      <section className="tumpuk">
        {batas.vote > 0 && (
          // Waktu habis hanya diberi tanda dan bunyi: siapa yang keluar tetap diputuskan pemain.
          <Hitungan key={`vote-${fase.ronde}`} awalMs={batas.vote * 1000} totalMs={batas.vote * 1000} label="Waktu diskusi dan vote" bunyi />
        )}
        <div className="kartu">
          <KepalaFase judul="Vote" ronde={fase.ronde} />
          <div className="pilih-pemain">
            {pemain.map((p, i) =>
              p.hidup ? (
                <button key={i} className={`pemain ${fase.pilih === i ? 'pilih' : ''}`} aria-pressed={fase.pilih === i} onClick={() => setFase({ ...fase, pilih: i })}>
                  <KartuVote nama={p.nama} entri={petunjukMilik(game.petunjuk, String(i))} ronde={fase.ronde} />
                </button>
              ) : null,
            )}
            <button
              className={`pemain lewati ${fase.pilih === LEWATI_LOKAL ? 'pilih' : ''}`}
              aria-pressed={fase.pilih === LEWATI_LOKAL}
              onClick={() => setFase({ ...fase, pilih: LEWATI_LOKAL })}
            >
              Lewati
            </button>
          </div>
          <p className="catatan">Lewati: tidak ada yang keluar ronde ini.</p>
        </div>
        <div className="aksi-bawah">
          {fase.pilih === LEWATI_LOKAL ? (
            <button className="utama" onClick={() => setFase({ jenis: 'aman', ronde: fase.ronde })}>
              Lewati vote
            </button>
          ) : (
            <button className="utama bahaya" disabled={fase.pilih === null} onClick={() => fase.pilih !== null && onEliminasi(fase.pilih, fase.ronde)}>
              {fase.pilih === null ? 'Pilih' : `Eliminasi ${pemain[fase.pilih].nama}`}
            </button>
          )}
        </div>
      </section>
    );
  }

  if (fase.jenis === 'aman') {
    return (
      <section className="tumpuk tengah">
        <div className="kartu besar muncul">
          <h1 className="kata">Aman</h1>
          <p className="catatan">Vote dilewati. Tidak ada yang tereliminasi. Lanjut ke ronde berikutnya.</p>
          <button className="utama" onClick={() => onLanjut(fase.ronde)}>Lanjut</button>
        </div>
      </section>
    );
  }

  if (fase.jenis === 'terungkap') {
    const p = pemain[fase.idx];
    const tebak = detikTebakan(batas);
    const menebak = p.peran === 'mrwhite' && fase.tebakan === 'belum';
    return (
      <section className="tumpuk tengah">
        {menebak && tebak > 0 && (
          <Hitungan key={`tebak-${fase.ronde}`} awalMs={tebak * 1000} totalMs={tebak * 1000} label={`Waktu tebakan ${p.nama}`} bunyi onHabis={onTebakHabis} />
        )}
        <div className={`kartu besar peran-${p.peran}`}>
          <p className="sub">{p.nama} tereliminasi</p>
          <h1 className="kata ungkap">{NAMA_PERAN[p.peran]}</h1>
          {menebak ? (
            <TebakMrWhite nama={p.nama} onTebak={onTebak} />
          ) : (
            <>
              {fase.tebakan === 'salah' && <p className="catatan">{fase.habis ? 'Waktu habis. Dianggap salah.' : 'Tebakan salah.'}</p>}
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

/** Data riwayat petunjuk mode lokal (kunci pemain = indeks). */
function propsRiwayatLokal(game: Permainan, tampilPeran: boolean) {
  const { fase } = game;
  const aktif = fase.jenis === 'diskusi' || fase.jenis === 'vote' || fase.jenis === 'terungkap' || fase.jenis === 'aman';
  return {
    pemain: game.pemain.map((p, i) => ({ kunci: String(i), nama: p.nama, hidup: p.hidup, peran: tampilPeran || !p.hidup ? p.peran : undefined })),
    entri: game.petunjuk,
    giliran: fase.jenis === 'diskusi' && fase.giliran < fase.urutan.length ? String(fase.urutan[fase.giliran]) : null,
    ronde: aktif ? fase.ronde : Math.max(1, ...game.petunjuk.map((e) => e.ronde)),
    urutan: fase.jenis === 'diskusi' ? fase.urutan.map(String) : undefined,
  };
}

function GiliranPetunjuk({ game, fase, detik, onGiliran, onVote, daftar }: {
  game: Permainan;
  fase: Extract<Fase, { jenis: 'diskusi' }>;
  /** Batas waktu petunjuk (detik), 0 berarti tanpa batas. */
  detik: number;
  onGiliran: (teks: string | null, habis?: boolean) => void;
  onVote: () => void;
  /** Urutan giliran sekaligus semua petunjuk (satu baris per pemain). */
  daftar: ReactNode;
}) {
  const [galat, setGalat] = useState<string | null>(null);
  const [habis, setHabis] = useState(false);
  const jeda = useRef<number | null>(null);
  useEffect(() => () => {
    if (jeda.current !== null) window.clearTimeout(jeda.current);
  }, []);
  const idx = fase.urutan[fase.giliran];
  const p = game.pemain[idx];
  const kirim = (teks: string) => {
    const r = cekPetunjuk(teks, kataUntuk(p, game.pasangan), teksDipakai(game.petunjuk));
    if ('galat' in r) setGalat(r.galat);
    else onGiliran(r.teks);
  };
  // Waktu habis: aman dilewati otomatis (sama seperti Skip), dengan tanda di riwayat.
  const waktuHabis = () => {
    setHabis(true);
    jeda.current = window.setTimeout(() => {
      jeda.current = null;
      onGiliran(null, true);
    }, JEDA_HABIS_MS);
  };
  return (
    <section className="tumpuk">
      {detik > 0 && (
        <Hitungan awalMs={detik * 1000} totalMs={detik * 1000} label={`Waktu ${p.nama}`} bunyi onHabis={waktuHabis} />
      )}
      {habis && <p className="galat" role="alert">Waktu habis. Giliran {p.nama} dilewati.</p>}
      <FormPetunjuk
        judul={`Giliran ${p.nama}`}
        galat={galat}
        onUbah={() => setGalat(null)}
        onKirim={kirim}
        onSudahBicara={() => onGiliran(null)}
      />
      <div className="kartu">
        <KepalaFase judul="Diskusi" ronde={fase.ronde} />
        {daftar}
      </div>
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
          <li>Atur pemain, jumlah peran, dan kategori kata, lalu tekan Mulai. Pasangan buatan pemain dari menu Kamus otomatis ikut masuk ke Kamus kita dan Internet, di mode Lokal maupun Online.</li>
          <li>Oper HP ke setiap pemain. Tekan untuk melihat kata, hafalkan, lalu tutup sebelum mengoper.</li>
          <li>Petunjuk: sesuai urutan, setiap pemain mengetik satu petunjuk singkat (maksimal 30 karakter) tentang katanya tanpa menyebut kata itu. Petunjuk yang sama dengan kata rahasia atau yang sudah dipakai ditolak. Semua petunjuk tercatat di riwayat per pemain dan per ronde. Tombol Sudah bicara menyelesaikan giliran tanpa mencatat apa pun ke riwayat.</li>
          <li>Voting: baca riwayat petunjuk, lalu pilih satu pemain yang paling dicurigai. Perannya langsung dibuka. Pilih Lewati jika belum yakin: tidak ada yang keluar dan permainan lanjut ke ronde berikutnya.</li>
          <li>Jika Mr. White tereliminasi, dia boleh menebak kata Civilian. Tebakan benar berarti Mr. White menang.</li>
        </ol>
        <h3>Batas waktu</h3>
        <ul>
          <li>Bawaan Tanpa batas. Di pengaturan bisa dipilih batas waktu petunjuk per giliran (20 sampai 60 detik) dan batas diskusi dan vote (30 sampai 120 detik). Pilihan terakhir diingat di HP ini. Di mode Online, host yang memilih dan berlaku untuk semua pemain.</li>
          <li>Hitung mundur tampil di atas layar. Di 5 detik terakhir ada bunyi ketukan dan getar singkat, mengikuti pengaturan Suara dan Getar.</li>
          <li>Petunjuk: jika waktu habis, giliran dilewati otomatis dan riwayat mencatat (waktu habis).</li>
          <li>Vote di mode Lokal: waktu habis hanya diberi tanda dan bunyi. Siapa yang keluar tetap kalian yang memutuskan. Di mode Online, vote langsung dihitung seperti tombol Hitung; yang belum memilih dianggap tidak memilih.</li>
          <li>Tebakan Mr. White mendapat waktu yang sama dengan petunjuk (minimal 30 detik). Jika habis, tebakan dianggap salah.</li>
        </ul>
        <h3>Menang</h3>
        <ul>
          <li>Civilian menang jika semua Undercover dan Mr. White tereliminasi.</li>
          <li>Penyusup (Undercover dan Mr. White) menang jika jumlah mereka yang tersisa sama atau lebih banyak dari Civilian, termasuk saat tinggal 2 pemain.</li>
        </ul>
        <h3>Online</h3>
        <ul>
          <li>Satu orang membuat room dan menjadi host. Pemain lain gabung dengan kode, link, atau QR.</li>
          <li>Setiap pemain melihat katanya sendiri di HP masing-masing, lalu mengetik petunjuk bergiliran sesuai urutan di layar. Pemain lain melihat tulisan Menunggu [nama] dan riwayat petunjuk yang diperbarui langsung. Setelah semua mendapat giliran, voting dimulai otomatis.</li>
          <li>Voting dilakukan dari HP masing-masing. Setiap pemain boleh memilih Lewati (abstain); Lewati tidak menambah suara siapa pun dan tetap dihitung sudah vote. Jika Lewati lebih banyak dari suara terbanyak, atau tidak ada suara untuk siapa pun, tidak ada yang tereliminasi. Jika suara terbanyak seri (termasuk seri dengan Lewati), ada vote ulang sekali antara yang seri. Jika masih seri, tidak ada yang tereliminasi.</li>
          <li>Main Online perlu login. Nama di room adalah username akunmu, dan host memeriksa bahwa akun itu benar milikmu.</li>
          <li>Jika host keluar atau koneksinya putus, peran host pindah otomatis ke pemain lain dan permainan lanjut. Host lama bisa gabung lagi dengan kode yang sama.</li>
          <li>Hasil permainan dicatat oleh host ke profil semua pemain.</li>
          <li>Cari match: pilih jumlah pemain (4 sampai 8) atau Acak, lalu tunggu. Pemain dicocokkan sesuai urutan masuk antrean, tanpa melihat skor. Pemain Acak bisa mengisi ukuran mana pun; jika semua Acak, match dibentuk setelah minimal 4 orang menunggu sekitar 20 detik. Pemain yang paling dulu antre jadi host, semua pemain masuk room otomatis, dan permainan mulai sendiri saat semua sudah masuk (atau setelah 45 detik jika minimal 4). Aturan room match: Mr. White ikut (mulai 5 pemain), petunjuk 45 detik, vote 60 detik, kata dari Kamus kita dan Internet termasuk kamus pemain. Tekan Batal atau tutup halaman untuk keluar dari antrean.</li>
        </ul>
        <h3>Suara dan notifikasi</h3>
        <ul>
          <li>Tombol speaker di pojok atas membuka pengaturan Suara, Getar, Volume, dan Notifikasi giliran.</li>
          <li>Bunyi dan getar paling jelas saat giliranmu memberi petunjuk, atau saat kamu Mr. White yang harus menebak. Momen lain (pemain gabung, voting, hasil, chat) hanya bunyi halus.</li>
          <li>Notifikasi giliran hanya muncul saat giliranmu dan halaman sedang tidak dilihat, selama room masih terbuka di latar. Jika aplikasi sudah ditutup, notifikasi tidak muncul. Di iPhone, pasang dulu ke Layar Utama (iOS 16.4 ke atas).</li>
        </ul>
        <p className="catatan">Semua data (nama, pengaturan, riwayat kata) hanya disimpan di HP ini. Mode Lokal tanpa login dan tanpa pelacakan. Di mode Online, pesan dikirim lewat Supabase Realtime dalam keadaan terenkripsi (cadangan: koneksi langsung WebRTC atau relay lain), dan hasil permainan disimpan di akunmu.</p>
      </div>
      <div className="aksi-bawah">
        <button className="utama" onClick={onTutup}>Oke</button>
      </div>
    </section>
  );
}
