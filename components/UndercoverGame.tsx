'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  bagiPeran, cekPemenang, eliminasi, kataUntuk, komposisiDefault,
  MAX_PEMAIN, MIN_PEMAIN, namaDefault, tambahSkor, tebakanBenar, urutanBicara,
  validasiSetup, type Komposisi,
} from '@/lib/game';
import { rapikanKategori, SEMUA_KATEGORI, siapkanPasangan } from '@/lib/bankKata';
import { baca, KUNCI, simpan } from '@/lib/storage';
import type { PasanganKata, Pemain, Pemenang } from '@/lib/types';
import { angka, AturPeran, JUDUL_MENANG, KartuBalik, Konfeti, NAMA_PERAN, PilihKategori, Stepper } from './ui';

const PILIHAN_TIMER = [0, 60, 90, 120, 180];

type Fase =
  | { jenis: 'serah'; idx: number; terbuka: boolean }
  | { jenis: 'diskusi'; ronde: number; urutan: number[] }
  | { jenis: 'vote'; ronde: number; pilih: number | null }
  | { jenis: 'terungkap'; ronde: number; idx: number; tebakan: 'belum' | 'salah' }
  | { jenis: 'hasil'; pemenang: Pemenang; tebakanMrWhite?: string };

interface Permainan {
  pemain: Pemain[];
  pasangan: PasanganKata;
  fase: Fase;
}

type Layar = 'setup' | 'caramain' | 'skor' | 'main';

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

function kategoriAwal(): string[] {
  const valid = rapikanKategori(baca<unknown>(KUNCI.kategori, null));
  return valid.length > 0 ? valid : SEMUA_KATEGORI;
}

export default function UndercoverGame({ onBeranda }: { onBeranda?: () => void }) {
  const [layar, setLayar] = useState<Layar>('setup');
  const [nama, setNama] = useState<string[]>(namaAwal);
  const [komposisi, setKomposisi] = useState<Komposisi>(() => komposisiAwal(namaAwal().length));
  const [kategori, setKategori] = useState<string[]>(kategoriAwal);
  const [timer, setTimer] = useState<number>(() => baca<number>(KUNCI.timer, 0));
  const [skor, setSkor] = useState<Record<string, number>>(() => baca(KUNCI.skor, {}));
  const [game, setGame] = useState<Permainan | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);

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
      const pasangan = await siapkanPasangan(kategori);
      const bersih = nama.map((n) => n.trim());
      simpan(KUNCI.nama, bersih);
      simpan(KUNCI.komposisi, komposisi);
      simpan(KUNCI.kategori, kategori);
      simpan(KUNCI.timer, timer);
      setNama(bersih);
      setGame({ pemain: bagiPeran(bersih, komposisi), pasangan, fase: { jenis: 'serah', idx: 0, terbuka: false } });
      setLayar('main');
    } catch {
      setGalatMuat('Gagal memuat bank kata. Periksa koneksi lalu coba lagi.');
    } finally {
      setMemuat(false);
    }
  }

  function selesai(pemain: Pemain[], pemenang: Pemenang, tebakanMrWhite?: string) {
    const baru = tambahSkor(skor, pemain, pemenang);
    setSkor(baru);
    simpan(KUNCI.skor, baru);
    setGame((g) => (g ? { ...g, pemain, fase: { jenis: 'hasil', pemenang, tebakanMrWhite } } : g));
  }

  function lanjutSetelahEliminasi(pemain: Pemain[], ronde: number) {
    const pemenang = cekPemenang(pemain);
    if (pemenang) return selesai(pemain, pemenang);
    setGame((g) => (g ? { ...g, pemain, fase: { jenis: 'diskusi', ronde: ronde + 1, urutan: urutanBicara(pemain) } } : g));
  }

  function resetSkor() {
    if (!window.confirm('Hapus semua skor yang tersimpan di HP ini?')) return;
    setSkor({});
    simpan(KUNCI.skor, {});
  }

  return (
    <main className="wadah">
      <header className="kepala">
        <button
          className="logo"
          onClick={() => (layar === 'main' ? undefined : layar === 'setup' && onBeranda ? onBeranda() : setLayar('setup'))}
          aria-label={layar === 'setup' && onBeranda ? 'Undercover, kembali ke beranda' : 'Undercover'}
        >
          <span aria-hidden>🕵️</span> Undercover
        </button>
        {layar !== 'main' ? (
          <nav className="navigasi">
            <button className={layar === 'caramain' ? 'aktif' : ''} onClick={() => setLayar(layar === 'caramain' ? 'setup' : 'caramain')}>Cara main</button>
            <button className={layar === 'skor' ? 'aktif' : ''} onClick={() => setLayar(layar === 'skor' ? 'setup' : 'skor')}>Skor</button>
          </nav>
        ) : (
          <button
            className="kecil"
            onClick={() => {
              if (window.confirm('Akhiri permainan ini dan kembali ke pengaturan?')) {
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
      {layar === 'skor' && <PapanSkor skor={skor} onReset={resetSkor} onTutup={() => setLayar('setup')} />}

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

          <PilihKategori kategori={kategori} onUbah={setKategori} />

          <div className="kartu">
            <div className="baris-judul">
              <h2>Timer diskusi</h2>
            </div>
            <div className="chip-grup">
              {PILIHAN_TIMER.map((d) => (
                <button key={d} className={`chip ${timer === d ? 'pilih' : ''}`} aria-pressed={timer === d} onClick={() => setTimer(d)}>
                  {d === 0 ? 'Tanpa timer' : `${d / 60 >= 1 && d % 60 === 0 ? `${d / 60} menit` : `${d} detik`}`}
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
              {memuat ? 'Menyiapkan kata...' : 'Mulai main'}
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
          onMainLagi={mulai}
          onAturUlang={() => {
            setGame(null);
            setLayar('setup');
          }}
          memuat={memuat}
          skor={skor}
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
  onMainLagi: () => void;
  onAturUlang: () => void;
  memuat: boolean;
  skor: Record<string, number>;
}

function LayarMain({ game, timer, setFase, onEliminasi, onTebak, onLanjut, onMainLagi, onAturUlang, memuat, skor }: PropsMain) {
  const { pemain, pasangan, fase } = game;

  if (fase.jenis === 'serah') {
    const p = pemain[fase.idx];
    const kata = kataUntuk(p, pasangan);
    const terakhir = fase.idx === pemain.length - 1;
    return (
      <section className="tumpuk tengah">
        <p className="langkah">Pemain {fase.idx + 1} dari {pemain.length}</p>
        <KartuBalik
          terbuka={fase.terbuka}
          depan={
            <>
              <p className="sub">Berikan HP ke</p>
              <h1 className="nama-besar">{p.nama}</h1>
              <p className="catatan">Pastikan pemain lain tidak melihat layar.</p>
              <button className="utama" onClick={() => setFase({ ...fase, terbuka: true })}>Lihat kata saya</button>
            </>
          }
          belakang={
            <>
              <p className="sub">{p.nama}, kata kamu:</p>
              {kata ? (
                <h1 className="kata">{kata}</h1>
              ) : (
                <>
                  <h1 className="kata">Kamu Mr. White</h1>
                  <p className="catatan">Kamu tidak mendapat kata. Dengarkan petunjuk pemain lain dan berbaurlah.</p>
                </>
              )}
              <button
                className="utama"
                onClick={() =>
                  terakhir
                    ? setFase({ jenis: 'diskusi', ronde: 1, urutan: urutanBicara(pemain) })
                    : setFase({ jenis: 'serah', idx: fase.idx + 1, terbuka: false })
                }
              >
                {terakhir ? 'Tutup dan mulai diskusi' : 'Tutup dan lanjut'}
              </button>
            </>
          }
        />
      </section>
    );
  }

  if (fase.jenis === 'diskusi') {
    return (
      <section className="tumpuk">
        <div className="kartu">
          <h2>Ronde {fase.ronde}: Diskusi</h2>
          <p className="catatan">Bergiliran sebutkan satu petunjuk tentang kata kamu, sesuai urutan berikut.</p>
          <ol className="urutan">
            {fase.urutan.map((i, k) => (
              <li key={i}>
                <span className="nomor">{k + 1}</span> {pemain[i].nama}
              </li>
            ))}
          </ol>
        </div>
        {timer > 0 && <Timer key={fase.ronde} detik={timer} />}
        <div className="aksi-bawah">
          <button className="utama" onClick={() => setFase({ jenis: 'vote', ronde: fase.ronde, pilih: null })}>Mulai voting</button>
        </div>
      </section>
    );
  }

  if (fase.jenis === 'vote') {
    return (
      <section className="tumpuk">
        <div className="kartu">
          <h2>Ronde {fase.ronde}: Voting</h2>
          <p className="catatan">Diskusikan lalu pilih satu pemain yang paling dicurigai untuk dieliminasi.</p>
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
        <div className="aksi-bawah">
          <button className="utama bahaya" disabled={fase.pilih === null} onClick={() => fase.pilih !== null && onEliminasi(fase.pilih, fase.ronde)}>
            {fase.pilih === null ? 'Pilih pemain dulu' : `Eliminasi ${pemain[fase.pilih].nama}`}
          </button>
          <button className="kedua" onClick={() => setFase({ jenis: 'diskusi', ronde: fase.ronde, urutan: urutanBicara(pemain) })}>Kembali ke diskusi</button>
        </div>
      </section>
    );
  }

  if (fase.jenis === 'terungkap') {
    const p = pemain[fase.idx];
    return (
      <section className="tumpuk tengah">
        <div className={`kartu besar peran-${p.peran}`}>
          <p className="sub">{p.nama} tereliminasi. Perannya:</p>
          <h1 className="kata ungkap">{NAMA_PERAN[p.peran]}</h1>
          {p.peran === 'mrwhite' && fase.tebakan === 'belum' ? (
            <TebakMrWhite nama={p.nama} onTebak={onTebak} />
          ) : (
            <>
              {fase.tebakan === 'salah' && <p className="catatan">Tebakan Mr. White salah. Permainan berlanjut.</p>}
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
        {fase.pemenang === 'mrwhite' && <p className="catatan">Mr. White menebak kata Civilian dengan benar: “{fase.tebakanMrWhite}”.</p>}
        {fase.pemenang === 'penyusup' && <p className="catatan">Undercover dan Mr. White berhasil bertahan.</p>}
        {fase.pemenang === 'civilian' && <p className="catatan">Semua Undercover dan Mr. White sudah tertangkap.</p>}
        <div className="kata-hasil">
          <div><span>Kata Civilian</span><strong>{pasangan.civilian}</strong></div>
          <div><span>Kata Undercover</span><strong>{pasangan.undercover}</strong></div>
        </div>
        <p className="catatan kecil-teks">Sumber: {pasangan.sumber}</p>
      </div>
      <div className="kartu">
        <h2>Peran semua pemain</h2>
        <ul className="daftar-hasil">
          {pemain.map((p, i) => (
            <li key={i} className={p.hidup ? '' : 'mati'}>
              <span>{p.nama}</span>
              <span className={`lencana ${p.peran}`}>{NAMA_PERAN[p.peran]}</span>
              <span className="poin">{angka(skor[p.nama] ?? 0)} poin</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="aksi-bawah">
        <button className="utama" onClick={onMainLagi} disabled={memuat}>{memuat ? 'Menyiapkan kata...' : 'Main lagi (pemain sama)'}</button>
        <button className="kedua" onClick={onAturUlang}>Atur ulang</button>
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
      <label htmlFor="tebakan">{nama}, tebak kata Civilian. Kalau benar, Mr. White menang!</label>
      <input id="tebakan" value={teks} onChange={(e) => setTeks(e.target.value)} autoComplete="off" autoCapitalize="off" placeholder="Ketik tebakan" />
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
        {sisa > 0 && <button className="kedua" onClick={() => setJalan((j) => !j)}>{jalan ? 'Jeda' : 'Mulai timer'}</button>}
        <button className="kedua" onClick={() => { setJalan(false); setSisa(detik); }}>Ulangi</button>
      </div>
      {sisa === 0 && <p className="catatan">Waktu habis!</p>}
    </div>
  );
}

function PapanSkor({ skor, onReset, onTutup }: { skor: Record<string, number>; onReset: () => void; onTutup: () => void }) {
  const daftar = Object.entries(skor).sort((a, b) => b[1] - a[1]);
  return (
    <section className="tumpuk">
      <div className="kartu">
        <h2>Skor kumulatif</h2>
        <p className="catatan">Tersimpan di HP ini saja. Civilian menang: +2, Mr. White menang: +6, Undercover menang: +10.</p>
        {daftar.length === 0 ? (
          <p>Belum ada skor. Selesaikan satu permainan dulu.</p>
        ) : (
          <ol className="daftar-hasil">
            {daftar.map(([n, s]) => (
              <li key={n}><span>{n}</span><span className="poin">{angka(s)} poin</span></li>
            ))}
          </ol>
        )}
      </div>
      <div className="aksi-bawah">
        <button className="utama" onClick={onTutup}>Kembali</button>
        {daftar.length > 0 && <button className="kedua" onClick={onReset}>Hapus skor</button>}
      </div>
    </section>
  );
}

function CaraMain({ onTutup }: { onTutup: () => void }) {
  return (
    <section className="tumpuk">
      <div className="kartu teks">
        <h2>Cara main</h2>
        <p>Undercover dimainkan 3 sampai 20 orang. Pilih Main di Satu HP (HP dioper bergiliran) atau Main Online (setiap pemain memakai HP sendiri lewat kode room).</p>
        <h3>Peran</h3>
        <ul>
          <li><strong>Civilian</strong>: mayoritas, semua mendapat kata yang sama.</li>
          <li><strong>Undercover</strong>: mendapat kata yang mirip tapi berbeda. Undercover tidak tahu bahwa dirinya Undercover.</li>
          <li><strong>Mr. White</strong>: tidak mendapat kata sama sekali dan harus berpura-pura tahu.</li>
        </ul>
        <h3>Alur</h3>
        <ol>
          <li>Atur pemain, jumlah peran, dan kategori kata, lalu tekan Mulai main.</li>
          <li>Oper HP ke setiap pemain. Tekan untuk melihat kata, hafalkan, lalu tutup sebelum mengoper.</li>
          <li>Diskusi: sesuai urutan, setiap pemain menyebut satu petunjuk tentang katanya tanpa menyebut kata itu.</li>
          <li>Voting: pilih satu pemain yang paling dicurigai. Perannya langsung dibuka.</li>
          <li>Jika Mr. White tereliminasi, dia boleh menebak kata Civilian. Tebakan benar berarti Mr. White menang.</li>
        </ol>
        <h3>Menang</h3>
        <ul>
          <li>Civilian menang jika semua Undercover dan Mr. White tereliminasi.</li>
          <li>Penyusup (Undercover dan Mr. White) menang jika jumlah mereka yang tersisa sama atau lebih banyak dari Civilian, termasuk saat tinggal 2 pemain.</li>
        </ul>
        <h3>Main Online</h3>
        <ul>
          <li>Satu orang membuat room dan menjadi host. Pemain lain gabung dengan kode, link, atau QR.</li>
          <li>Setiap pemain melihat katanya sendiri di HP masing-masing, lalu bicara bergiliran sesuai urutan di layar.</li>
          <li>Voting dilakukan dari HP masing-masing. Jika suara terbanyak seri, ada vote ulang sekali antara yang seri. Jika masih seri, tidak ada yang tereliminasi.</li>
          <li>HP host harus tetap membuka halaman selama permainan.</li>
        </ul>
        <p className="catatan">Semua data (nama, skor, riwayat kata) hanya disimpan di HP ini. Tidak ada login dan tidak ada pelacakan. Di mode online, HP saling terhubung langsung (WebRTC); server perantara PeerJS hanya dipakai untuk saling menemukan.</p>
      </div>
      <div className="aksi-bawah">
        <button className="utama" onClick={onTutup}>Mengerti</button>
      </div>
    </section>
  );
}
