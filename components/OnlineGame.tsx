'use client';

// Mode online: setiap pemain memakai HP sendiri. HP host memegang state lengkap dan hanya
// mengirim view yang sudah difilter (kata milik pemain itu sendiri) ke setiap pemain.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { komposisiDefault, MIN_PEMAIN, rapikanPanjangKata, validasiSetup, type Komposisi } from '@/lib/game';
import { kategoriTersimpan, kunciKategori, PESAN_TANPA_SATU_KATA, semuaKategori, siapkanPasangan, siapkanPasanganCampur, sumberTersimpan, tebakSumber } from '@/lib/bankKata';
import { baca, KUNCI, simpan } from '@/lib/storage';
import { EVENT_DIKELUARKAN, PESAN_DIKELUARKAN } from '@/lib/akun';
import { alasanTanpaEliminasi, alihkanHost, buatStateHost, pulihkanStateHost, rapikanNama, viewUntuk } from '@/lib/online/host';
import { HostRoom, KlienRoom, type StatusJaringan } from '@/lib/online/jaringan';
import { modeRelayDari, paksaRelayDari, teksDiagnosa, teksJalur } from '@/lib/online/jalur';
import type { ModeRelay } from '@/lib/online/relay';
import { BATAS_MENYAMBUNG_MS, pesanMacet, sudahMacet } from '@/lib/online/macet';
import type { PesanChat } from '@/lib/online/chat';
import { buatIdPemain, buatKodeRoom, kodeValid, rapikanKode } from '@/lib/online/room';
import {
  bacaSesi, bacaStateHostMentah, bersihkanAktifBasi, bolehTawarkanLanjut, buatToken, DETAK_AKTIF_MS, hapusSesi, hapusStateHost, lepasAktif,
  sesiDipakaiHalamanLain, simpanSesi, simpanStateHost, tandaiAktif, type SesiOnline,
} from '@/lib/online/sesi';
import { SUARA_LEWATI, type Aksi, type AksiKhususHost, type AksiPemain, type GameView, type PemainView, type Pengaturan, type StateHost, type ViewPemain } from '@/lib/online/types';
import {
  AturPeran, JUDUL_MENANG, KartuBalik, KepalaFase, Konfeti, NAMA_PERAN, PilihBatasWaktu, PilihKategori, PilihPanjangKata, PilihSumberKata, Tanda, TombolMenu, useDaftarKeluar, type Penjaga,
} from './ui';
import { Hitungan } from './Hitungan';
import { batasTersimpan, rapikanBatasWaktu, TEKS_WAKTU_HABIS } from '@/lib/batasWaktu';
import { kunciGiliran, peristiwaOnline, pilihUtama } from '@/lib/umpan/peristiwa';
import { tutupNotifikasiGiliran, umpan } from '@/lib/umpan/mesin';
import { ChatRoom } from './ChatRoom';
import { TombolSuara } from './PanelSuara';
import { DaftarPetunjuk, FormPetunjuk, KartuVote, LembarPetunjuk, petunjukMilik, RiwayatPetunjuk, type PemainRiwayat } from './Petunjuk';
import { useDialog } from './Modal';
import { menangDengan } from '@/lib/akun';
import { KartuCariMatch, LayarAntrean } from './Antrean';
import { alasanMulaiOtomatis, campurAwalMatch, pakaiCampur, DETAK_MATCH_MS, formatTunggu, MIN_MULAI_MATCH, sisaHitungMundur, type StatusMatch } from '@/lib/online/antrean';
import { detakMatch, keluarMatch, keluarMatchSaatTutup, mulaiMatch } from '@/lib/supabase/antrean';
import { useLihatProfil } from './Akun';
import { Avatar } from './Avatar';
import type { HasilUntukDicatat } from '@/lib/supabase/data';
import { supabase } from '@/lib/supabase/klien';
import { pembuatRealtime } from '@/lib/online/realtime';
import {
  ambilAlihHost, barisHasilRoom, galatDitolakServer, PESAN_GAGAL_CATAT, PESAN_ROOM_TAK_TERDAFTAR, bukaSnapshot, buatRoom, catatHasilRoom, detakHost, gabungRoom, hasilTercatat, roomSupabase, sandikanSnapshot,
  tinggalkanRoom, verifikasiPemain, type RoomSupabase,
} from '@/lib/supabase/room';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Pengaturan awal room match: komposisi bawaan (Mr. White mulai 5 pemain), petunjuk 45 detik, vote 60 detik, sumber kata pilihan host. */
function pengaturanMatch(jumlah: number): Pengaturan {
  // Sumber kata awal: pilihan host terakhir (Campur, Kamus kita, atau Internet), selain itu Campur.
  const campur = campurAwalMatch(baca<unknown>(KUNCI.sumberMatchCampur, null), baca<unknown>(KUNCI.sumberKata, null) !== null);
  const sumber = campur ? 'internet' : sumberTersimpan();
  return {
    komposisi: komposisiDefault(jumlah),
    sumberKata: sumber,
    kategori: campur ? semuaKategori('internet') : kategoriTersimpan(sumber),
    sumberCampur: campur,
    panjangKata: rapikanPanjangKata(null),
    batasWaktu: { petunjuk: 45, vote: 60 },
  };
}

const TEKS_STATUS: Record<StatusJaringan, string> = {
  menyambung: 'Menyambung',
  tersambung: 'Online',
  menyambungUlang: 'Menyambung',
  hostTidakAda: 'Mencari host',
  idDipakai: 'Membuka room',
  gagal: 'Gagal',
};

type AksiUi = AksiPemain | AksiKhususHost;

/** Host mengirim sisa durasi, bukan jam: ubah ke tenggat dalam jam HP ini agar selisih jam antar-HP tidak berpengaruh. */
function denganJamLokal(v: ViewPemain): ViewPemain {
  const t = v.game?.tenggat;
  if (!v.game || !t) return v;
  return { ...v, game: { ...v.game, tenggat: { ...t, sampaiLokal: Date.now() + t.sisaMs } } };
}

export default function OnlineGame({ kodeAwal, username, userId, onBeranda, daftarPenjaga }: {
  kodeAwal: string | null;
  /** Id akun Supabase yang login (untuk host, verifikasi, dan pencatatan hasil). */
  userId: string;
  /** Nama pemain online = username akun yang sedang login. */
  username: string;
  onBeranda: () => void;
  daftarPenjaga?: (p: Penjaga | null) => void;
}) {
  const dialog = useDialog();
  // Tab hasil "duplikat" ikut menyalin sessionStorage; jangan pakai id yang masih aktif di tab asal.
  const [sesi, setSesi] = useState<SesiOnline | null>(() => {
    const s = bacaSesi('tab');
    // Sesi milik akun lain (mis. ganti akun di HP yang sama) tidak dilanjutkan.
    return s && s.nama === rapikanNama(username) && !sesiDipakaiHalamanLain(s.id) ? s : null;
  });
  const [view, setView] = useState<ViewPemain | null>(null);
  // `sejak`: kapan status terakhir berpindah antara tersambung dan belum (atau percobaan baru dimulai).
  const [status, setStatus] = useState<{ s: StatusJaringan; info?: string; sejak: number }>({ s: 'menyambung', sejak: 0 });
  const [sekarang, setSekarang] = useState(0);
  const [galatMasuk, setGalatMasuk] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [chat, setChat] = useState<PesanChat[]>([]);
  const [galatChat, setGalatChat] = useState<string | null>(null);
  const [draftChat, setDraftChat] = useState('');
  const [galatPetunjuk, setGalatPetunjuk] = useState<string | null>(null);
  const hostRef = useRef<HostRoom | null>(null);
  const klienRef = useRef<KlienRoom | null>(null);
  // Room di Supabase (relay utama + host pindah). null bila Supabase tidak tersedia (jalur lama tetap jalan).
  const roomRef = useRef<RoomSupabase | null>(null);
  const [hostPergi, setHostPergi] = useState(0);
  // Antrean matchmaking: undefined = tidak antre, null = Acak, angka = ukuran match.
  const [antre, setAntre] = useState<number | null | undefined>(undefined);
  const matchAktif = useRef(false);
  const pilihanMatch = useRef<number | null>(null);
  // Status room match dari server, beserta waktu diterima (untuk hitung mundur tanpa bergantung jam HP).
  const [infoMatch, setInfoMatch] = useState<{ s: StatusMatch; t: number } | null>(null);

  // Umpan balik: bandingkan view lama dan baru. Notifikasi HP hanya untuk giliranmu (lihat lib/umpan).
  const viewLalu = useRef<ViewPemain | null>(null);
  useEffect(() => {
    const lama = viewLalu.current && view && viewLalu.current.kode === view.kode ? viewLalu.current : null;
    viewLalu.current = view;
    if (!view) return;
    const p = pilihUtama(peristiwaOnline(lama, view));
    if (p) umpan(p);
    if (!kunciGiliran(view)) void tutupNotifikasiGiliran();
  }, [view]);
  // Pesan chat baru dari pemain lain: bunyi sangat halus, tanpa notifikasi.
  const chatLalu = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const akhir = chat.length > 0 ? chat[chat.length - 1] : null;
    const lalu = chatLalu.current;
    chatLalu.current = akhir?.id ?? null;
    if (akhir && lalu !== undefined && akhir.id !== lalu && akhir.dari !== sesi?.id) umpan('chat');
  }, [chat, sesi?.id]);

  const tampilkan = useCallback((t: string) => setToast(t), []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const ubahStatus = useCallback((s: StatusJaringan, info?: string, baru = false) => {
    const t = Date.now();
    setStatus((prev) => ({
      s,
      info,
      sejak: baru || (prev.s === 'tersambung') !== (s === 'tersambung') ? t : prev.sejak,
    }));
  }, []);

  const keluarSesi = useCallback((alasan?: string, hanyaTab = false) => {
    // Lepas kursi room match (bila ada). Aman dipanggil walau bukan room match.
    if (matchAktif.current) void keluarMatch().catch(() => undefined);
    matchAktif.current = false;
    hostRef.current?.hentikan();
    klienRef.current?.hentikan();
    hostRef.current = null;
    klienRef.current = null;
    hapusSesi(hanyaTab);
    setSesi(null);
    setView(null);
    setChat([]);
    setGalatChat(null);
    setGalatMasuk(alasan ?? null);
  }, []);

  // Single login: akun masuk di perangkat lain, tinggalkan room/match dengan rapi (host lama dipindah otomatis).
  useEffect(() => {
    const saatDikeluarkan = () => keluarSesi(PESAN_DIKELUARKAN);
    window.addEventListener(EVENT_DIKELUARKAN, saatDikeluarkan);
    return () => window.removeEventListener(EVENT_DIKELUARKAN, saatDikeluarkan);
  }, [keluarSesi]);

  // Tandai sesi ini sedang dipakai halaman ini, agar tab lain tidak menawarkan "Lanjut" dengan id yang sama.
  useEffect(() => {
    if (!sesi) return;
    const id = sesi.id;
    bersihkanAktifBasi();
    tandaiAktif(id);
    const detak = window.setInterval(() => tandaiAktif(id), DETAK_AKTIF_MS);
    // Saat halaman dimuat ulang atau ditutup, lepas tanda agar sesi bisa langsung dilanjutkan.
    const lepas = () => lepasAktif(id);
    window.addEventListener('pagehide', lepas);
    return () => {
      window.clearInterval(detak);
      window.removeEventListener('pagehide', lepas);
      lepasAktif(id);
    };
  }, [sesi]);

  // Sambungkan sesuai sesi (host atau pemain). Dibersihkan saat sesi berganti atau komponen ditutup.
  useEffect(() => {
    if (!sesi) return;
    simpanSesi({ ...sesi, waktu: Date.now() });
    // Panggilan status pertama menandai awal percobaan baru (untuk batas waktu menyambung).
    let baru = true;
    const lapor = (s: StatusJaringan, info?: string) => {
      ubahStatus(s, info, baru);
      baru = false;
    };
    let paksaRelay = false;
    let modeRelay: ModeRelay = 'semua';
    try {
      const simpanJalur = window.sessionStorage.getItem('online:jalur') ?? window.localStorage.getItem('online:jalur');
      paksaRelay = paksaRelayDari(window.location.search, simpanJalur);
      modeRelay = modeRelayDari(window.location.search, simpanJalur);
    } catch {
      // localStorage bisa diblokir; abaikan
    }
    let batal = false;
    let bersihkan: (() => void) | null = null;
    roomRef.current = null;
    const siapkan = async (): Promise<void> => {
    const pulih = sesi.host ? pulihkanStateHost(bacaStateHostMentah(), Date.now()) : null;
    const dipulihkan = !!pulih && pulih.kode === sesi.kode && pulih.hostId === sesi.id;
    // Daftarkan room di Supabase: host membuat room, pemain menjadi anggota dan mendapat nonce identitas.
    let room: RoomSupabase | null = null;
    let nonce: string | undefined;
    try {
      const r = await roomSupabase(sesi.kode);
      if (sesi.host) {
        const hasil = await buatRoom(r.hex);
        if (batal) return;
        if (hasil === 'dipakai') {
          if (sesi.match && !dipulihkan) {
            keluarSesi('Room match bentrok. Cari match lagi.');
            return;
          }
          if (!dipulihkan) {
            setSesi({ ...sesi, kode: buatKodeRoom() });
            return;
          }
          // Host sudah pindah ke pemain lain selama halaman ini tertutup: lanjut sebagai pemain.
          hapusStateHost();
          setSesi({ ...sesi, host: false });
          return;
        }
        room = r;
      } else {
        let n = await gabungRoom(r.hex);
        // Room match: host mungkin belum selesai membuat room. Coba lagi sebentar.
        for (let i = 0; !n && sesi.match && i < 20 && !batal; i++) {
          await new Promise((ok) => window.setTimeout(ok, 1000));
          n = await gabungRoom(r.hex);
        }
        if (batal) return;
        if (!n && sesi.match) {
          // Host room match sudah pergi sebelum room dibuat: lepas kursi lalu cari room lain.
          keluarSesi();
          setAntre(pilihanMatch.current);
          return;
        }
        if (n) {
          room = r;
          nonce = n;
        }
      }
    } catch (e) {
      // Supabase tidak terjangkau: tetap jalan lewat relay cadangan (tanpa host pindah).
      // Bila server menolak (mis. batas room), beri tahu host: hasil tidak akan tercatat.
      if (sesi.host && galatDitolakServer(e)) tampilkan(PESAN_ROOM_TAK_TERDAFTAR);
    }
    if (batal) return;
    roomRef.current = room;
    const utama = room ? { utama: pembuatRealtime(supabase) } : {};
    if (sesi.host) {
      const awalMentah: StateHost = dipulihkan
        ? (pulih as StateHost)
        : buatStateHost(sesi.kode, sesi.id, sesi.nama, sesi.match ? pengaturanMatch(sesi.match) : {
          komposisi: komposisiDefault(MIN_PEMAIN),
          sumberKata: sumberTersimpan(),
          kategori: kategoriTersimpan(sumberTersimpan()),
          panjangKata: rapikanPanjangKata(baca<unknown>(KUNCI.panjangKata, null)),
          batasWaktu: batasTersimpan(),
        }, Date.now());
      const awal: StateHost = { ...awalMentah, pemain: awalMentah.pemain.map((p) => (p.id === sesi.id ? { ...p, uid: userId } : p)) };
      simpanStateHost(awal);
      const host = new HostRoom(awal, {
        onState: (s) => {
          simpanStateHost(s);
          setView(denganJamLokal(viewUntuk(s, sesi.id)));
        },
        onStatus: (s, info) => {
          lapor(s, info);
          // Kode bentrok dengan room lain yang masih aktif: buat kode baru selama room masih kosong.
          if (s === 'idDipakai' && !dipulihkan && host.state.pemain.length === 1 && !host.state.game && Number(info) >= 2) {
            setSesi({ ...sesi, kode: buatKodeRoom() });
          }
        },
        onChat: setChat,
      }, { paksaRelay, modeRelay, ...utama, ...(room ? { verifikasi: (n: string) => verifikasiPemain(room.hex, n) } : {}) });
      hostRef.current = host;
      void host.mulai();
      // Detak host + snapshot terenkripsi (untuk host pindah) + pencatatan hasil oleh host.
      let timer = 0;
      if (room) {
        let terakhir = 0;
        let seqKirim = -1;
        const tercatat = new Set<string>();
        const gagalDiumumkan = new Set<string>();
        const detak = async () => {
          const st = host.state;
          const t = Date.now();
          if (st.seq !== seqKirim || t - terakhir >= 5000) {
            terakhir = t;
            seqKirim = st.seq;
            try {
              const masih = await detakHost(room.hex, await sandikanSnapshot(room, st));
              if (batal) return;
              if (!masih) {
                // Pemain lain sudah mengambil alih host (mis. HP ini sempat putus): lanjut sebagai pemain.
                hapusStateHost();
                tampilkan('Host sudah pindah ke pemain lain.');
                setSesi({ ...sesi, host: false });
                return;
              }
            } catch {
              // coba lagi di detak berikutnya
            }
          }
          const hasil = barisHasilRoom(st);
          if (hasil && !tercatat.has(hasil.idMain)) {
            tercatat.add(hasil.idMain);
            catatHasilRoom(room.hex, hasil.idMain, hasil.baris).catch(() => {
              tercatat.delete(hasil.idMain);
              if (!gagalDiumumkan.has(hasil.idMain)) {
                gagalDiumumkan.add(hasil.idMain);
                tampilkan(PESAN_GAGAL_CATAT);
              }
            });
          }
        };
        void detak();
        timer = window.setInterval(() => void detak(), 1000);
      }
      bersihkan = () => {
        window.clearInterval(timer);
        host.hentikan();
        if (hostRef.current === host) hostRef.current = null;
      };
      return;
    }
    const klien = new KlienRoom(sesi.kode, { id: sesi.id, nama: sesi.nama, token: sesi.token, ...(nonce ? { nonce } : {}) }, {
      onView: (v) => {
        if (!v.pemain.some((p) => p.id === v.saya)) {
          keluarSesi('Kamu dikeluarkan dari room oleh host.');
          return;
        }
        setHostPergi(0);
        setView(denganJamLokal(v));
      },
      onStatus: lapor,
      onTolak: (alasan, saatGabung) => {
        if (saatGabung) keluarSesi(alasan);
        else tampilkan(alasan);
      },
      onChat: setChat,
      onTolakChat: (alasan, teks) => {
        setGalatChat(alasan);
        // Kembalikan pesan yang ditolak ke kolom input, kecuali pengguna sudah mengetik pesan baru.
        if (teks) setDraftChat((d) => (d.trim() ? d : teks));
      },
      onTolakPetunjuk: setGalatPetunjuk,
      // Salinan sesi di perangkat dibiarkan: kemungkinan milik tab lain yang baru mengambil alih.
      onDiganti: (alasan) => keluarSesi(alasan, true),
      // Jalur relay mendapat jatah waktu penuh sebelum layar "Coba lagi" muncul.
      onJalur: () => {
        baru = true;
      },
      onHostPergi: () => setHostPergi(Date.now()),
      onIdAkun: (id, token) => setSesi({ ...sesi, id, token }),
    }, { paksaRelay, modeRelay, ...utama, relayUtama: !!room });
    klienRef.current = klien;
    void klien.mulai();
    bersihkan = () => {
      klien.hentikan();
      if (klienRef.current === klien) klienRef.current = null;
    };
    };
    void siapkan();
    return () => {
      batal = true;
      bersihkan?.();
    };
  }, [sesi, userId, keluarSesi, tampilkan, ubahStatus]);

  // Host pindah: bila host keluar atau lama tidak terdengar, satu pemain (yang menang di server) menjadi host baru
  // dari snapshot terenkripsi terakhir, lalu permainan berlanjut.
  const adaView = !!view;
  useEffect(() => {
    if (!sesi || sesi.host || !adaView || (status.s === 'tersambung' && !hostPergi)) return;
    let hidup = true;
    let sibuk = false;
    const coba = async () => {
      const room = roomRef.current;
      if (!room || sibuk || !hidup) return;
      sibuk = true;
      try {
        const r = await ambilAlihHost(room.hex);
        if (!r || !hidup) return;
        const st = alihkanHost(await bukaSnapshot(room, r.snapshot), sesi.id, r.hostKeluar, Date.now());
        if (!st || !hidup) return;
        simpanStateHost({ ...st, pemain: st.pemain.map((p) => (p.id === sesi.id ? { ...p, uid: userId } : p)) });
        tampilkan('Host keluar. Kamu sekarang host room ini.');
        setHostPergi(0);
        setSesi({ ...sesi, host: true });
      } catch {
        // pemain lain mungkin lebih dulu; coba lagi nanti
      } finally {
        sibuk = false;
      }
    };
    // Jeda acak kecil agar tidak semua pemain berebut bersamaan.
    const awal = window.setTimeout(() => void coba(), hostPergi ? 300 + Math.random() * 900 : 4000 + Math.random() * 2000);
    const id = window.setInterval(() => void coba(), 4000);
    return () => {
      hidup = false;
      window.clearTimeout(awal);
      window.clearInterval(id);
    };
  }, [sesi, adaView, status.s, hostPergi, userId, tampilkan]);

  // Pengaman: jangan pernah menunggu tanpa ujung. Setelah BATAS_MENYAMBUNG_MS belum tersambung, tampilkan alasan + tombol.
  const siap = status.s === 'tersambung';
  useEffect(() => {
    if (!sesi || siap || !status.sejak) return;
    const sisa = Math.max(0, status.sejak + BATAS_MENYAMBUNG_MS - Date.now());
    const id = window.setTimeout(() => setSekarang(Date.now()), sisa + 50);
    return () => window.clearTimeout(id);
  }, [sesi, siap, status.sejak]);
  const macet = !!sesi && sudahMacet(status.s, status.sejak, sekarang);

  // Diagnosa jalur di layar "Coba lagi": jalur apa saja yang sudah dicoba dan keadaannya, diperbarui tiap detik.
  const [diagnosa, setDiagnosa] = useState<string[]>([]);
  useEffect(() => {
    if (!macet) return;
    const perbarui = () => {
      const r = hostRef.current ?? klienRef.current;
      setDiagnosa(r ? teksDiagnosa(r.diagnosa()) : []);
    };
    perbarui();
    const id = window.setInterval(perbarui, 1000);
    return () => window.clearInterval(id);
  }, [macet]);

  const cobaLagi = useCallback(() => {
    // Objek sesi baru memicu effect: koneksi lama dihentikan dan dibuat ulang dari awal.
    setSesi((s) => (s ? { ...s } : s));
  }, []);
  /** Host keluar: simpan snapshot terakhir, umumkan, lalu pemain lain mengambil alih host. */
  const hostKeluar = useCallback(async () => {
    const host = hostRef.current;
    const room = roomRef.current;
    if (host && room) {
      host.umumkanPergi();
      try {
        await tinggalkanRoom(room.hex, await sandikanSnapshot(room, host.state));
      } catch {
        // tanpa tanda keluar, pemain tetap mengambil alih setelah detak host berhenti
      }
      host.umumkanPergi();
      await new Promise((r) => window.setTimeout(r, 300));
    }
    hapusStateHost();
  }, []);
  const keluarRoom = useCallback(async () => {
    if (sesi?.host) await hostKeluar();
    keluarSesi();
  }, [sesi, keluarSesi, hostKeluar]);

  const aksi = useCallback(
    (a: AksiUi) => {
      if (!sesi) return;
      const petunjuk = a.jenis === 'petunjuk' || a.jenis === 'sudahBicara';
      if (petunjuk) setGalatPetunjuk(null);
      if (hostRef.current) {
        const t = hostRef.current.dispatch({ ...a, dari: sesi.id } as Aksi);
        // Galat petunjuk tampil di bawah kolom input, bukan sebagai toast.
        if (t && petunjuk) setGalatPetunjuk(t);
        else if (t) tampilkan(t);
      } else if (klienRef.current) {
        if (!klienRef.current.kirim(a as AksiPemain)) tampilkan('Belum tersambung ke host. Coba lagi sebentar.');
      }
    },
    [sesi, tampilkan],
  );

  const kirimChat = useCallback((teks: string): boolean => {
    let galat: string | undefined;
    if (hostRef.current) galat = hostRef.current.kirimChat(teks);
    else if (klienRef.current) galat = klienRef.current.kirimChat(teks);
    else galat = 'Belum tersambung ke host. Coba lagi sebentar.';
    setGalatChat(galat ?? null);
    return !galat;
  }, []);

  const sesiMatch = sesi?.match;
  const mulaiGame = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    setMemuat(true);
    try {
      const { kategori, panjangKata, sumberKata } = host.state.pengaturan;
      let hasil;
      if (sesiMatch) {
        // Room match: tandai sudah mulai agar tidak menerima pemain matchmaking baru.
        void mulaiMatch().catch(() => undefined);
        // Komposisi mengikuti jumlah pemain online saat mulai (Mr. White mulai 5 pemain).
        const n = host.state.pemain.filter((p) => p.online).length;
        aksi({ jenis: 'aturPengaturan', pengaturan: { ...host.state.pengaturan, komposisi: komposisiDefault(Math.max(MIN_PEMAIN, n)) } });
        if (pakaiCampur(host.state.pengaturan)) {
          // Campur: Kamus kita atau Internet diacak tiap game, semua kategori termasuk kamus pemain.
          hasil = await siapkanPasanganCampur(rapikanPanjangKata(panjangKata));
          aksi({ jenis: 'aturPengaturan', pengaturan: { ...host.state.pengaturan, sumberKata: hasil.sumber, kategori: hasil.kategori } });
        } else {
          // Sumber dan kategori pilihan host, berlaku juga saat mulai otomatis.
          hasil = await siapkanPasangan(kategori, rapikanPanjangKata(panjangKata), sumberKata ?? tebakSumber(kategori));
        }
      } else {
        hasil = await siapkanPasangan(kategori, rapikanPanjangKata(panjangKata), sumberKata ?? tebakSumber(kategori));
      }
      const { pasangan, cadangan } = hasil;
      aksi({ jenis: 'mulai', pasangan, idMain: crypto.randomUUID() });
      if (cadangan) void dialog.info({ judul: 'Pasangan satu kata tidak ada', pesan: PESAN_TANPA_SATU_KATA });
    } catch {
      tampilkan('Gagal memuat bank kata. Periksa koneksi lalu coba lagi.');
    } finally {
      setMemuat(false);
    }
  }, [aksi, tampilkan, dialog, sesiMatch]);

  // Room match: detak kursi ke server (status j/maks dan lama tanpa pemain baru), lepas kursi saat halaman ditutup.
  const kodeSesiMatch = sesi?.match ? sesi.kode : null;
  useEffect(() => {
    if (!kodeSesiMatch) return;
    matchAktif.current = true;
    let hidup = true;
    const detak = () =>
      void detakMatch()
        .then((s) => {
          if (hidup) setInfoMatch(s && s.kode === kodeSesiMatch ? { s, t: Date.now() } : null);
        })
        .catch(() => undefined);
    detak();
    const id = window.setInterval(detak, DETAK_MATCH_MS);
    const tutup = () => void keluarMatchSaatTutup();
    window.addEventListener('pagehide', tutup);
    return () => {
      hidup = false;
      window.clearInterval(id);
      window.removeEventListener('pagehide', tutup);
      setInfoMatch(null);
    };
  }, [kodeSesiMatch]);

  // Host room match mulai otomatis: saat room penuh, atau minimal 4 pemain dan 60 detik tanpa pemain baru.
  const mulaiOtomatis = useRef<string | null>(null);
  const kodeMatch = sesi?.match && sesi.host ? sesi.kode : null;
  const maksMatch = sesi?.match ?? 0;
  const onlineLobby = view && !view.game ? view.pemain.filter((p) => p.online).length : 0;
  const lobbyMatch = !!kodeMatch && !!view && !view.game && !memuat;
  useEffect(() => {
    if (!kodeMatch || !lobbyMatch || mulaiOtomatis.current === kodeMatch) return;
    const cek = () => {
      if (mulaiOtomatis.current === kodeMatch) return;
      // Tunggu status server dulu agar mode room (Acak atau tetap) diketahui.
      if (!infoMatch || infoMatch.s.dimulai) return;
      // Sumber pilihan host tanpa kategori: tunggu host memperbaikinya (tombol Mulai juga nonaktif).
      const atur = hostRef.current?.state.pengaturan;
      if (atur && !pakaiCampur(atur) && atur.kategori.length === 0) return;
      const diam = infoMatch.s.diamMs + (Date.now() - infoMatch.t);
      if (!alasanMulaiOtomatis(onlineLobby, maksMatch, diam, infoMatch.s.acak)) return;
      mulaiOtomatis.current = kodeMatch;
      void mulaiGame();
    };
    // Jeda singkat agar pemain terakhir sempat menerima view lobby dan komposisi menyesuaikan.
    const id = window.setInterval(cek, 1500);
    return () => window.clearInterval(id);
  }, [kodeMatch, lobbyMatch, maksMatch, onlineLobby, infoMatch, mulaiGame]);

  // Kembali ke menu dari room: konfirmasi, lalu putuskan PeerJS dan hapus sesi tersimpan agar tidak gabung ulang otomatis.
  const penjaga = useCallback(async () => {
    if (!sesi) return true;
    const ya = await dialog.konfirmasi(
      sesi.host
        ? { judul: 'Keluar dari room?', pesan: `Peran host pindah ke pemain lain dan permainan di room ${sesi.kode} tetap berjalan.`, ok: 'Keluar', bahaya: true }
        : { judul: 'Keluar dari room?', pesan: 'Kamu bisa gabung lagi dengan kode yang sama selama room masih dibuka.', ok: 'Keluar', bahaya: true },
    );
    if (!ya) return false;
    if (sesi.host) await hostKeluar();
    else {
      aksi({ jenis: 'keluar' });
      // Beri waktu pesan keluar terkirim sebelum koneksi ditutup.
      await new Promise((r) => window.setTimeout(r, 150));
    }
    keluarSesi();
    return true;
  }, [sesi, dialog, aksi, keluarSesi, hostKeluar]);
  useEffect(() => {
    daftarPenjaga?.(penjaga);
    return () => daftarPenjaga?.(null);
  }, [penjaga, daftarPenjaga]);

  if (!sesi && antre !== undefined) {
    return (
      <LayarAntrean
        ukuran={antre}
        onBatal={(g) => {
          setAntre(undefined);
          setGalatMasuk(g ?? null);
        }}
        onCocok={(s: StatusMatch) => {
          setAntre(undefined);
          setGalatMasuk(null);
          setView(null);
          setStatus({ s: 'menyambung', sejak: Date.now() });
          setSesi({ kode: s.kode, id: buatIdPemain(), token: buatToken(), nama: rapikanNama(username), host: s.host, waktu: 0, match: s.maks });
        }}
      />
    );
  }

  if (!sesi) {
    return (
      <LayarMasuk
        onCari={(u) => {
          setGalatMasuk(null);
          pilihanMatch.current = u;
          setAntre(u);
        }}
        kodeAwal={kodeAwal}
        username={username}
        galat={galatMasuk}
        onBeranda={onBeranda}
        onMasuk={(s) => {
          setGalatMasuk(null);
          setView(null);
          setStatus({ s: 'menyambung', sejak: Date.now() });
          setSesi(s);
        }}
      />
    );
  }

  const gDok = view?.game;
  const lembar = view && gDok && gDok.fase !== 'kata' && (gDok.petunjuk.length > 0 || gDok.fase === 'diskusi' || gDok.fase === 'vote');
  return (
    <main className={`wadah${view ? ' punya-dok' : ''}`}>
      <header className="kepala">
        <div className="kiri-kepala">
          <TombolMenu onClick={onBeranda} />
          <div className="info-room">
          <span className="kode-kecil" aria-label={`Kode room ${sesi.kode}`}>{sesi.kode}</span>
          <span className={`status ${status.s}`} role="status">
            <span className="titik" aria-hidden />
            {TEKS_STATUS[status.s]}
            {!sesi.host && status.s === 'tersambung' && (status.info === 'relay' || status.info === 'langsung') && <span className="jalur">· {teksJalur(status.info)}</span>}
          </span>
          </div>
        </div>
        <div className="aksi-kepala">
          <TombolSuara />
        </div>
      </header>

      {toast && <p className="toast" role="alert">{toast}</p>}

      {view && macet && (
        <div className="kartu macet" role="alert">
          <p className="galat">{pesanMacet(sesi.host, sesi.kode, status.s, status.info)}</p>
          <PanelDiagnosa baris={diagnosa} />
          <div className="baris-tombol">
            <button className="utama" onClick={cobaLagi}>Coba lagi</button>
            <button className="kedua" onClick={() => void keluarRoom()}>Keluar dari room</button>
          </div>
        </div>
      )}

      {!view ? (
        <section className="tumpuk tengah masuk">
          {macet ? (
            <div className="kartu besar" role="alert">
              <p>{pesanMacet(sesi.host, sesi.kode, status.s, status.info)}</p>
              <PanelDiagnosa baris={diagnosa} />
              <div className="baris-tombol">
                <button className="utama" onClick={cobaLagi}>Coba lagi</button>
                <button className="kedua" onClick={keluarRoom}>Keluar dari room</button>
              </div>
            </div>
          ) : (
            <div className="kartu besar">
              <div className="pemutar" aria-hidden />
              <p>{status.s === 'hostTidakAda' ? `Room ${sesi.kode} belum ditemukan. Pastikan HP host membuka room ini dan kodenya benar.` : 'Menyambung'}</p>
              {status.s === 'gagal' && <p className="catatan">{status.info}</p>}
              <p className="catatan">Lama? Jaringan ini mungkin memblokir koneksi antar HP. Coba data seluler atau Wi-Fi lain.</p>
            </div>
          )}
        </section>
      ) : (
        <Ruang
          view={view} host={sesi.host} match={sesi.match} infoMatch={infoMatch} aksi={aksi} mulaiGame={mulaiGame} memuat={memuat} tampilkan={tampilkan}
          galatPetunjuk={galatPetunjuk} hapusGalatPetunjuk={() => setGalatPetunjuk(null)}
        />
      )}
      {view && (
        // Dok bawah: tetap di tempat saat digulir, di bawah tombol aksi (tidak menutupinya).
        <nav className="dok" aria-label="Petunjuk dan chat">
          <div className="dok-isi">
            {lembar && gDok && <LembarPetunjuk {...propsRiwayat(view, gDok)} />}
            <ChatRoom pesan={chat} saya={sesi.id} kirim={kirimChat} galat={galatChat} teks={draftChat} ubahTeks={setDraftChat} />
          </div>
        </nav>
      )}
    </main>
  );
}

/* --------------------------------- Masuk --------------------------------- */

function LayarMasuk({ kodeAwal, username, galat, onBeranda, onMasuk, onCari }: {
  onCari: (ukuran: number | null) => void;
  kodeAwal: string | null;
  username: string;
  galat: string | null;
  onBeranda: () => void;
  onMasuk: (s: SesiOnline) => void;
}) {
  const [kode, setKode] = useState(kodeAwal ?? '');
  const cariLanjut = useCallback(() => {
    const s = bacaSesi('perangkat');
    return s && s.nama === rapikanNama(username) && bolehTawarkanLanjut(s, kodeAwal, sesiDipakaiHalamanLain(s.id)) ? s : null;
  }, [kodeAwal, username]);
  const [lanjut, setLanjut] = useState(cariLanjut);
  // Penanda tab aktif bisa kedaluwarsa (tab lain ditutup atau crash): periksa ulang berkala.
  useEffect(() => {
    bersihkanAktifBasi();
    const id = window.setInterval(() => {
      const baru = cariLanjut();
      setLanjut((lama) => (JSON.stringify(lama) === JSON.stringify(baru) ? lama : baru));
    }, DETAK_AKTIF_MS);
    return () => window.clearInterval(id);
  }, [cariLanjut]);
  const namaBersih = rapikanNama(username);
  const kodeBersih = rapikanKode(kode);

  function masuk(host: boolean) {
    if (!namaBersih) return;
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
        <TombolMenu onClick={onBeranda} />
        <span className="logo"><Tanda /> Undercover</span>
        <TombolSuara />
      </header>
      <section className="tumpuk masuk">
        <div className="kepala-fase"><h2>Online</h2></div>
        <div className="kartu">
          <p className="label nol">Main sebagai</p>
          <p className="nama-akun" id="nama-online">{namaBersih}</p>
        </div>

        {galat && <p className="galat" role="alert">{galat}</p>}

        {lanjut && (
          <div className="kartu">
            <h2>Lanjut</h2>
            <p className="catatan">Room <span className="kode-kecil">{lanjut.kode}</span> sebagai {lanjut.nama}{lanjut.host ? ' (host)' : ''}</p>
            <div className="baris-tombol">
              <button className="utama" onClick={() => onMasuk({ ...lanjut, waktu: Date.now() })}>Lanjut</button>
              <button className="kedua" onClick={() => { hapusSesi(); window.location.reload(); }}>Hapus</button>
            </div>
          </div>
        )}

        <div className="kartu">
          <label className="label" htmlFor="kode-room">Kode</label>
          <input
            id="kode-room"
            className="isian kode"
            value={kode}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="K7QX2"
            onChange={(e) => setKode(rapikanKode(e.target.value))}
          />
          {kode && !kodeValid(kodeBersih) && <p className="catatan">Kode terdiri dari 4 sampai 6 huruf/angka (tanpa O, 0, I, 1, L).</p>}
          <button className="utama jarak-atas" disabled={!namaBersih || !kodeValid(kodeBersih)} onClick={() => masuk(false)}>Gabung</button>
        </div>

        <div className="kartu">
          <button className={kodeAwal ? 'kedua' : 'utama'} disabled={!namaBersih} onClick={() => masuk(true)}>Buat</button>
          <p className="catatan">HP kamu jadi host. Biarkan halaman tetap terbuka.</p>
        </div>
        <KartuCariMatch onCari={onCari} />
        <div className="aksi-bawah" />
      </section>
    </main>
  );
}

/* --------------------------------- Ruang --------------------------------- */

interface PropsRuang {
  view: ViewPemain;
  host: boolean;
  /** Jumlah pemain bila room ini hasil matchmaking. */
  match?: number;
  infoMatch?: { s: StatusMatch; t: number } | null;
  aksi: (a: AksiUi) => void;
  mulaiGame: () => void;
  memuat: boolean;
  tampilkan: (t: string) => void;
  galatPetunjuk: string | null;
  hapusGalatPetunjuk: () => void;
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

function Lobby({ view, host, match, infoMatch, aksi, mulaiGame, memuat, tampilkan }: PropsRuang) {
  const online = view.pemain.filter((p) => p.online);
  const [manual, setManual] = useState(false);
  const { komposisi, kategori } = view.pengaturan;
  const panjangKata = rapikanPanjangKata(view.pengaturan.panjangKata);
  const sumberKata = view.pengaturan.sumberKata ?? tebakSumber(kategori);
  const batasWaktu = rapikanBatasWaktu(view.pengaturan.batasWaktu);
  const atur = (p: Partial<Pengaturan>) =>
    aksi({ jenis: 'aturPengaturan', pengaturan: { ...view.pengaturan, komposisi, kategori, panjangKata, sumberKata, batasWaktu, ...p } });
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
      aksi({ jenis: 'aturPengaturan', pengaturan: { ...view.pengaturan, komposisi: k, kategori, panjangKata, sumberKata } });
    }
  }, [host, manual, jumlah, komposisi, kategori, panjangKata, sumberKata, aksi, view.pengaturan]);

  const aturKomposisi = (k: Komposisi) => {
    setManual(true);
    atur({ komposisi: k });
  };
  const aturKategori = (k: string[]) => {
    simpan(kunciKategori(sumberKata), k);
    atur({ kategori: k });
  };
  // Ganti sumber: kategori ikut berganti ke pilihan tersimpan sumber itu (bawaan semua).
  const campur = !!match && pakaiCampur(view.pengaturan);
  const aturSumber = (s: typeof sumberKata) => {
    simpan(KUNCI.sumberKata, s);
    if (match) simpan(KUNCI.sumberMatchCampur, false);
    atur({ sumberKata: s, kategori: kategoriTersimpan(s), sumberCampur: match ? false : undefined });
  };
  const aturPanjangKata = (p: typeof panjangKata) => {
    simpan(KUNCI.panjangKata, p);
    atur({ panjangKata: p });
  };
  const aturBatasWaktu = (b: typeof batasWaktu) => {
    simpan(KUNCI.batasWaktu, b);
    atur({ batasWaktu: b });
  };

  return (
    <section className="tumpuk">
      {match ? (
        <InfoMatch maks={match} online={jumlah} host={host} info={infoMatch ?? null} />
      ) : <KartuUndangan kode={view.kode} tampilkan={tampilkan} />}
      <DaftarPemain view={view} host={host} aksi={aksi} />
      <AturPeran
        jumlah={jumlah}
        komposisi={komposisi}
        nonaktif={!host}
        onUbah={aturKomposisi}
        onOtomatis={() => {
          setManual(false);
          atur({ komposisi: komposisiDefault(Math.max(MIN_PEMAIN, jumlah)) });
        }}
      />
      {match && (
        <div className="kartu" id="sumber-match">
          <div className="baris-judul">
            <h2>Pilihan kata</h2>
          </div>
          <div className="segmen" role="group" aria-label="Pilihan kata room match">
            {([[true, 'Campur'], [false, 'Pilih sendiri']] as const).map(([nilai, nama]) => (
              <button
                key={nama}
                type="button"
                aria-pressed={campur === nilai}
                disabled={!host}
                onClick={() => {
                  simpan(KUNCI.sumberMatchCampur, nilai);
                  atur({ sumberCampur: nilai });
                }}
              >
                {nama}
              </button>
            ))}
          </div>
          <p className="catatan">
            {campur
              ? 'Kamus kita atau Internet diacak tiap game dari semua kategori (termasuk kamus pemain).'
              : 'Sumber dan kategori pilihan host di bawah dipakai saat game dimulai.'}
            {host ? '' : ' Diatur oleh host.'}
          </p>
        </div>
      )}
      {!campur && (
        <>
          <PilihSumberKata nilai={sumberKata} onUbah={aturSumber} nonaktif={!host} />
          <PilihKategori kategori={kategori} onUbah={aturKategori} nonaktif={!host} panjangKata={panjangKata} sumber={sumberKata} />
        </>
      )}
      <PilihPanjangKata nilai={panjangKata} onUbah={aturPanjangKata} nonaktif={!host} />
      <PilihBatasWaktu nilai={batasWaktu} onUbah={aturBatasWaktu} nonaktif={!host} mode="online" />
      {galat.length > 0 && (
        <ul className="galat" role="alert">
          {galat.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      <div className="aksi-bawah">
        {host ? (
          <button className="utama" disabled={galat.length > 0 || memuat || (!!match && jumlah < MIN_MULAI_MATCH)} onClick={mulaiGame}>
            {memuat ? 'Memuat' : `Mulai (${jumlah})`}
          </button>
        ) : (
          <p className="menunggu">Menunggu host</p>
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
      tampilkan('Disalin');
    } catch {
      await dialog.info({
        judul: 'Salin',
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
      <p className="sub">Kode</p>
      <p className="kode-besar" aria-label={`Kode room ${kode.split('').join(' ')}`}>{kode}</p>
      <div className="baris-tombol">
        <button className="kedua" onClick={salin}>Salin</button>
        {typeof navigator !== 'undefined' && 'share' in navigator && <button className="kedua" onClick={bagikan}>Bagikan</button>}
        <button className="kedua" aria-expanded={tampilQr} onClick={() => setTampilQr((x) => !x)}>QR</button>
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
  const lihatProfil = useLihatProfil();
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
              <button type="button" className="tautan nama-profil nama-dengan-avatar" aria-label={`Lihat profil ${p.nama}`} onClick={() => lihatProfil(p.nama)}><Avatar username={p.nama} cari ukuran={28} /><span className="nama-teks">{p.nama}</span></button>
              {p.id === view.saya && <em className="label-kamu">(kamu)</em>}
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

/* --------------------------------- Permainan -------------------------------- */

type PropsFase = PropsRuang & { g: GameView };

function KataSaya({ view, g, ringkas }: { view: ViewPemain; g: GameView; ringkas?: boolean }) {
  const [lihat, setLihat] = useState(false);
  const saya = namaDari(view, view.saya);
  const belakang = (
    <>
      <p className="sub">{saya}</p>
      {g.kata ? <h1 className="kata">{g.kata}</h1> : <h1 className="kata">Mr. White</h1>}
      {!g.kata && <p className="catatan">Kamu tanpa kata. Berbaurlah.</p>}
      <button className="kedua" onClick={() => setLihat(false)}>Sembunyi</button>
    </>
  );
  if (ringkas) {
    return lihat ? (
      <div className="kartu besar rahasia muncul">{belakang}</div>
    ) : (
      <button className="kedua" onClick={() => setLihat(true)}>Intip</button>
    );
  }
  return (
    <KartuBalik
      terbuka={lihat}
      depan={
        <>
          <p className="sub">Ronde {g.ronde}</p>
          <h1 className="nama-besar">{saya}</h1>
          <p className="catatan">Jangan sampai terlihat orang lain.</p>
          <button className="utama" onClick={() => setLihat(true)}>Lihat</button>
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

/** Riwayat petunjuk yang terlihat semua pemain (petunjuk memang publik; tidak memuat kata rahasia siapa pun). */
function propsRiwayat(view: ViewPemain, g: GameView) {
  const giliran = g.fase === 'diskusi' && g.giliran < g.urutan.length ? g.urutan[g.giliran] : null;
  const pemain: PemainRiwayat[] = pesertaDari(view).map((p) => ({
    kunci: p.id, nama: p.nama, hidup: p.hidup, peran: p.peran, saya: p.id === view.saya, offline: !p.online,
  }));
  return { pemain, entri: g.petunjuk, giliran, ronde: g.ronde, urutan: g.urutan };
}

function Riwayat({ view, g }: { view: ViewPemain; g: GameView }) {
  return <RiwayatPetunjuk {...propsRiwayat(view, g)} />;
}

function FaseKata({ view, g, host, aksi }: PropsFase) {
  const peserta = pesertaDari(view);
  const sudah = g.siap.includes(view.saya);
  return (
    <section className="tumpuk">
      <KataSaya view={view} g={g} />
      <div className="kartu">
        <Progres nilai={g.siap.length} total={peserta.length} label="Siap" />
        <ul className="chip-grup kecil-jarak">
          {peserta.map((p) => (
            <li key={p.id} className={`chip-status ${g.siap.includes(p.id) ? 'ok' : ''} ${p.online ? '' : 'offline'}`}>
              {g.siap.includes(p.id) ? '✓ ' : ''}{p.nama}
            </li>
          ))}
        </ul>
      </div>
      <div className="aksi-bawah">
        <button className="utama" disabled={sudah} onClick={() => aksi({ jenis: 'siap' })}>
          {sudah ? 'Menunggu' : 'Siap'}
        </button>
        {host && <button className="kedua" onClick={() => aksi({ jenis: 'mulaiDiskusi' })}>Diskusi</button>}
      </div>
    </section>
  );
}

function Diskusi({ view, g, host, aksi, galatPetunjuk, hapusGalatPetunjuk }: PropsFase) {
  const giliranId = g.giliran < g.urutan.length ? g.urutan[g.giliran] : null;
  const selesai = giliranId === null;
  const sayaGiliran = giliranId === view.saya;
  return (
    <section className="tumpuk">
      {giliranId && (
        <WaktuOnline g={g} awalan="diskusi|" label={sayaGiliran ? 'Waktu petunjukmu' : `Waktu ${namaDari(view, giliranId)}`} bunyi={sayaGiliran} />
      )}
      {sayaGiliran ? (
        <FormPetunjuk
          judul="Giliranmu"
          galat={galatPetunjuk}
          onUbah={() => { if (galatPetunjuk) hapusGalatPetunjuk(); }}
          onKirim={(teks) => aksi({ jenis: 'petunjuk', teks })}
          onSudahBicara={() => aksi({ jenis: 'sudahBicara' })}
        />
      ) : (
        <p className="menunggu" role="status">
          {selesai ? 'Menuju vote' : `Menunggu ${namaDari(view, giliranId)}`}
        </p>
      )}
      {/* Urutan giliran sekaligus semua petunjuk: satu baris per pemain, tanpa kartu riwayat terpisah. */}
      <div className="kartu">
        <KepalaFase judul="Diskusi" ronde={g.ronde} />
        <DaftarPetunjuk {...propsRiwayat(view, g)} giliranKe={g.giliran} />
      </div>
      {g.hidup ? <KataSaya view={view} g={g} ringkas /> : <p className="catatan tengah-teks">Tereliminasi</p>}
      {host && (
        <div className="aksi-bawah">
          <div className="baris-tombol">
            {giliranId && giliranId !== view.saya && (
              <button className="kedua" onClick={() => aksi({ jenis: 'lewatiGiliran' })}>Skip</button>
            )}
            <button className="kedua" onClick={() => aksi({ jenis: 'mulaiVote' })}>Vote</button>
          </div>
        </div>
      )}
    </section>
  );
}

const ATURAN_SERI = 'Lewati tidak menambah suara siapa pun. Lewati terbanyak: tidak ada yang keluar. Seri: vote ulang sekali. Masih seri: tidak ada yang keluar.';

function Voting({ view, g, host, aksi }: PropsFase) {
  const hidup = pesertaDari(view).filter((p) => p.hidup);
  const pemilih = hidup.filter((p) => g.kandidat.some((k) => k !== p.id));
  const bisaVote = g.ikut && g.hidup && g.kandidat.some((k) => k !== view.saya);
  return (
    <section className="tumpuk">
      <WaktuOnline g={g} awalan="vote|" label="Waktu vote" bunyi={bisaVote && !g.pilihanSaya} />
      <div className="kartu">
        <KepalaFase judul={g.putaranVote === 2 ? 'Vote ulang' : 'Vote'} ronde={g.ronde} />
        {g.putaranVote === 2 ? (
          <p className="catatan">
            Seri: {[...g.kandidat.map((id) => namaDari(view, id)), ...(g.kandidat.length === 1 ? ['Lewati'] : [])].join(' dan ')}. Masih seri berarti tidak ada yang keluar.
          </p>
        ) : (
          <p className="catatan">Pilih yang paling mencurigakan, atau Lewati. Bisa diganti.</p>
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
                <KartuVote nama={namaDari(view, id)} entri={petunjukMilik(g.petunjuk, id)} ronde={g.ronde} />
              </button>
            ))}
            <button
              className={`pemain lewati ${g.pilihanSaya === SUARA_LEWATI ? 'pilih' : ''}`}
              aria-pressed={g.pilihanSaya === SUARA_LEWATI}
              onClick={() => aksi({ jenis: 'vote', target: SUARA_LEWATI })}
            >
              Lewati
            </button>
          </div>
        ) : (
          <p className="menunggu">{g.hidup ? 'Kamu tidak ikut vote ulang ini.' : 'Tereliminasi'}</p>
        )}
      </div>
      <div className="kartu">
        <Progres nilai={g.sudahVote.filter((id) => pemilih.some((p) => p.id === id)).length} total={pemilih.length} label="Suara" />
        <ul className="chip-grup kecil-jarak">
          {pemilih.map((p) => (
            <li key={p.id} className={`chip-status ${g.sudahVote.includes(p.id) ? 'ok' : ''} ${p.online ? '' : 'offline'}`}>
              {g.sudahVote.includes(p.id) ? '✓ ' : ''}{p.nama}
            </li>
          ))}
        </ul>
        <p className="catatan">{ATURAN_SERI}</p>
      </div>
      {host && (
        <div className="aksi-bawah">
          <button className="kedua" onClick={() => aksi({ jenis: 'tutupVote' })}>Hitung</button>
        </div>
      )}
    </section>
  );
}

function RekapSuara({ view, g }: { view: ViewPemain; g: GameView }) {
  if (!g.hasilVote) return null;
  const daftar = Object.entries(g.hasilVote.hitung).sort((a, b) => b[1] - a[1]);
  const lewati = g.hasilVote.lewati ?? 0;
  const maks = Math.max(1, lewati, ...daftar.map(([, n]) => n));
  return (
    <div className="kartu">
      <h2>Suara</h2>
      <ul className="rekap">
        {daftar.map(([id, n]) => (
          <li key={id}>
            <span className="nama">{namaDari(view, id)}</span>
            <span className="bar"><span style={{ width: `${(n / maks) * 100}%` }} /></span>
            <strong>{n}</strong>
          </li>
        ))}
        {lewati > 0 && (
          <li className="rekap-lewati">
            <span className="nama">Lewati</span>
            <span className="bar"><span style={{ width: `${(lewati / maks) * 100}%` }} /></span>
            <strong>{lewati}</strong>
          </li>
        )}
      </ul>
    </div>
  );
}

function teksAman(view: ViewPemain, g: GameView): string {
  const h = g.hasilVote;
  const alasan = h ? alasanTanpaEliminasi(h) : 'kosong';
  if (h && alasan === 'seri') {
    const nama = h.seri.map((id) => namaDari(view, id));
    const max = Math.max(0, ...Object.values(h.hitung));
    if ((h.lewati ?? 0) === max) nama.push('Lewati');
    return `Suara masih seri setelah vote ulang (${nama.join(', ')}).`;
  }
  if (h && alasan === 'lewati') {
    const ada = Object.values(h.hitung).some((n) => n > 0);
    return ada ? `Lewati paling banyak dipilih (${h.lewati}).` : 'Semua memilih Lewati.';
  }
  return 'Tidak ada suara yang masuk.';
}

function Terungkap({ view, g, host, aksi }: PropsFase) {
  const korban = view.pemain.find((p) => p.id === g.tereliminasi);
  return (
    <section className="tumpuk">
      {g.tebakan === 'menunggu' && korban && (
        <WaktuOnline g={g} awalan="tebak|" label={korban.id === view.saya ? 'Waktu menebak' : `Waktu tebakan ${korban.nama}`} bunyi={korban.id === view.saya} />
      )}
      {!korban ? (
        <div className="kartu besar muncul">
          <h1 className="kata">Aman</h1>
          <p className="catatan">
            {teksAman(view, g)}{' '}
            Lanjut ke ronde berikutnya.
          </p>
        </div>
      ) : (
        <div className={`kartu besar peran-${korban.peran ?? 'civilian'}`}>
          <p className="sub">{korban.id === view.saya ? 'Kamu tereliminasi' : `${korban.nama} tereliminasi`}</p>
          <h1 className="kata ungkap">{korban.peran ? NAMA_PERAN[korban.peran] : '?'}</h1>
          {g.tebakan === 'menunggu' && (korban.id === view.saya ? (
            <TebakMrWhite onTebak={(teks) => aksi({ jenis: 'tebak', teks })} />
          ) : (
            <p className="menunggu">Menunggu {korban.nama}</p>
          ))}
          {g.tebakan === 'salah' && (
            <p className="catatan">
              {g.tebakanSalah === TEKS_WAKTU_HABIS ? 'Waktu habis. Dianggap salah.' : g.tebakanSalah ? `Tebakan salah: “${g.tebakanSalah}”` : 'Tidak menebak'}
            </p>
          )}
        </div>
      )}
      <RekapSuara view={view} g={g} />
      <div className="aksi-bawah">
        {host ? (
          <>
            {g.tebakan === 'menunggu' && <button className="kedua" onClick={() => aksi({ jenis: 'lewatiTebakan' })}>Skip</button>}
            <button className="utama" disabled={g.tebakan === 'menunggu'} onClick={() => aksi({ jenis: 'lanjut' })}>Lanjut</button>
          </>
        ) : (
          g.tebakan !== 'menunggu' && <p className="menunggu">Menunggu host</p>
        )}
      </div>
    </section>
  );
}

/** Hitung mundur dari tenggat host. Hanya tampil jika tenggat milik fase ini. */
function WaktuOnline({ g, awalan, label, bunyi }: { g: GameView; awalan: string; label: string; bunyi: boolean }) {
  const t = g.tenggat;
  if (!t || !t.kunci.startsWith(awalan)) return null;
  return <Hitungan key={t.kunci} sampai={t.sampaiLokal ?? null} awalMs={t.sisaMs} totalMs={t.totalMs} label={label} bunyi={bunyi} />;
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
      <label htmlFor="tebakan-online">Tebak kata Civilian. Benar berarti menang.</label>
      <input id="tebakan-online" value={teks} maxLength={60} onChange={(e) => setTeks(e.target.value)} autoComplete="off" autoCapitalize="off" placeholder="Tebakan" />
      <button className="utama" type="submit" disabled={!teks.trim()}>Tebak</button>
    </form>
  );
}

function Penonton({ view, g }: PropsFase) {
  const fase: Record<string, string> = { kata: 'membaca kata', diskusi: 'diskusi', vote: 'voting', terungkap: 'membuka peran' };
  return (
    <section className="tumpuk tengah">
      <div className="kartu besar">
        <h1 className="nama-besar">Menonton</h1>
        <p className="sub">Ronde {g.ronde}, {fase[g.fase] ?? g.fase}</p>
        <p className="catatan">Kamu ikut di permainan berikutnya.</p>
      </div>
      {g.petunjuk.length > 0 && <Riwayat view={view} g={g} />}
      <DaftarPemain view={view} host={false} aksi={() => undefined} />
    </section>
  );
}

/** Host mencatat hasil untuk semua pemain terverifikasi; di sini hanya dicek apakah hasilmu sudah masuk. */
function CatatHasil({ idMain }: Pick<HasilUntukDicatat, 'idMain'>) {
  const [status, setStatus] = useState<'proses' | 'ok' | 'galat'>('proses');
  useEffect(() => {
    let hidup = true;
    let coba = 0;
    let timer = 0;
    const jalan = async () => {
      try {
        const { data } = await supabase().auth.getSession();
        const uid = data.session?.user.id;
        if (uid && (await hasilTercatat(idMain, uid))) {
          if (hidup) setStatus('ok');
          return;
        }
      } catch {
        // coba lagi
      }
      if (!hidup) return;
      coba += 1;
      if (coba < 12) timer = window.setTimeout(() => void jalan(), 2500);
      else setStatus('galat');
    };
    timer = window.setTimeout(() => void jalan(), 1500);
    return () => {
      hidup = false;
      window.clearTimeout(timer);
    };
  }, [idMain]);
  if (status === 'proses') return null;
  return <p className="catatan tengah-teks nol" role="status">{status === 'ok' ? 'Hasil tercatat di profilmu.' : 'Hasil belum tercatat. Host mencatat hasil saat permainan selesai.'}</p>;
}

function Hasil({ view, g, host, aksi, mulaiGame, memuat }: PropsFase) {
  const lihatProfil = useLihatProfil();
  const h = g.hasil;
  if (!h) return null;
  const peserta = pesertaDari(view);
  const perananSaya = peserta.find((x) => x.id === view.saya)?.peran;
  const sayaMenang = perananSaya ? menangDengan(perananSaya, h.pemenang) : false;
  return (
    <section className="tumpuk">
      {g.ikut && perananSaya && h.idMain && (
        <CatatHasil idMain={h.idMain} />
      )}
      <Konfeti />
      <div className={`kartu besar menang-${h.pemenang} muncul`}>
        {g.ikut && <p className="sub">{sayaMenang ? 'Menang' : 'Kalah'}</p>}
        <h1 className="kata ungkap">{JUDUL_MENANG[h.pemenang]}</h1>
        {h.pemenang === 'mrwhite' && <p className="catatan">Tebakan benar: “{h.tebakanMrWhite}”</p>}
        <div className="kata-hasil">
          <div><span>Civilian</span><strong>{h.pasangan.civilian}</strong></div>
          <div><span>Undercover</span><strong>{h.pasangan.undercover}</strong></div>
        </div>
        <p className="catatan kecil-teks">Sumber: {h.pasangan.sumber}</p>
      </div>
      <div className="kartu">
        <h2>Peran</h2>
        <ul className="daftar-hasil">
          {peserta.map((p, i) => (
            <li key={p.id} className={`${p.hidup ? '' : 'mati'} muncul`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <button type="button" className="tautan nama-profil nama-dengan-avatar" aria-label={`Lihat profil ${p.nama}`} onClick={() => lihatProfil(p.nama)}><Avatar username={p.nama} cari ukuran={28} /><span className="nama-teks">{p.nama}</span></button>
              {p.peran && <span className={`lencana ${p.peran}`}>{NAMA_PERAN[p.peran]}</span>}
            </li>
          ))}
        </ul>
      </div>
      <Riwayat view={view} g={g} />
      <div className="aksi-bawah">
        {host ? (
          <>
            <button className="utama" disabled={memuat} onClick={mulaiGame}>{memuat ? 'Memuat' : 'Ulang'}</button>
            <button className="kedua" onClick={() => aksi({ jenis: 'keLobby' })}>Lobby</button>
          </>
        ) : (
          <p className="menunggu">Menunggu host</p>
        )}
      </div>
    </section>
  );
}

/** Daftar jalur yang dicoba (Langsung, Metered, MQTT) beserta keadaannya, untuk layar macet. */
function PanelDiagnosa({ baris }: { baris: string[] }) {
  if (!baris.length) return null;
  return (
    <div className="diagnosa" aria-label="Jalur yang dicoba">
      <p className="catatan">Jalur yang dicoba:</p>
      <ul>
        {baris.map((b) => <li key={b.split(':')[0]}>{b}</li>)}
      </ul>
    </div>
  );
}

/** Status room match di lobby: jumlah pemain dari maksimal dan hitung mundur mulai otomatis. */
function InfoMatch({ maks, online, host, info }: { maks: number; online: number; host: boolean; info: { s: StatusMatch; t: number } | null }) {
  const [sekarang, setSekarang] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setSekarang(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const diam = info ? info.s.diamMs + Math.max(0, sekarang - info.t) : 0;
  const acak = info?.s.acak === true;
  const sisa = info && !info.s.dimulai && !acak ? sisaHitungMundur(online, diam) : null;
  return (
    <div className="kartu" id="info-match">
      <h2 data-uji="jumlah-match">Menunggu pemain {online}/{maks}</h2>
      {sisa !== null ? (
        <p className="catatan" role="timer" data-uji="hitung-mundur">Mulai otomatis dalam {formatTunggu(sisa + 999)} jika tidak ada pemain baru.</p>
      ) : info?.s.dimulai ? (
        <p className="catatan">Room ini sudah pernah mulai, jadi tidak menerima pemain match baru.</p>
      ) : acak ? (
        <p className="catatan" data-uji="host-memulai">Room Acak: host yang memulai. Tidak ada mulai otomatis.</p>
      ) : (
        <p className="catatan">Room match terbuka. Pemain lain bisa masuk sampai penuh atau sampai game dimulai. Minimal {MIN_MULAI_MATCH} pemain untuk mulai.</p>
      )}
      <p className="catatan">{host ? (acak ? `Tekan Mulai bila sudah minimal ${MIN_MULAI_MATCH} pemain.` : `Mulai otomatis saat ${maks} pemain, atau tekan Mulai bila sudah minimal ${MIN_MULAI_MATCH}.`) : 'Host memulai permainan.'}</p>
    </div>
  );
}
