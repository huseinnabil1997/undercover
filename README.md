# Undercover: Tebak Kata

Game tebak kata **Undercover** dengan dua mode:

- **Main Online**: setiap pemain memakai HP sendiri, tersambung realtime peer-to-peer (WebRTC lewat PeerJS).
- **Main di Satu HP**: pass-and-play, satu HP dioper bergiliran (tetap bisa dipakai tanpa internet setelah halaman terbuka).
  Saat voting, kelompok bisa memilih **Lewati**: tidak ada yang tereliminasi dan permainan lanjut ke ronde berikutnya.

Dibuat dengan Next.js (App Router, static export) dan di-deploy ke GitHub Pages.

Live: https://huseinnabil1997.github.io/undercover/

- Tanpa backend, tanpa login, tanpa tracking/analytics.
- Data (nama pemain, skor, riwayat pasangan kata, sesi room) hanya tersimpan di `localStorage`/`sessionStorage` perangkat.
- Tampilan mobile-first (360 sampai 430 px), tombol besar, mendukung safe-area.

## Mode online

1. Host menekan **Main Online**, mengisi nama, lalu **Buat room**. Muncul kode room 5 huruf
   (tanpa huruf yang mirip seperti O/0, I/1), link `?room=KODE`, dan QR (dibuat di browser, tanpa layanan luar).
2. Pemain lain membuka link/QR atau mengetik kode, mengisi nama, lalu **Gabung**. Daftar pemain di lobby tersinkron.
3. Host mengatur jumlah Undercover, Mr. White, dan kategori, lalu memulai. Pemain yang datang saat game berjalan menjadi penonton
   dan otomatis ikut di game berikutnya.
4. Setiap HP hanya menerima katanya sendiri. Peran baru dibuka saat pemain tereliminasi atau di akhir game.
5. **Petunjuk ketik**: sesuai urutan giliran, pemain yang sedang giliran mengetik satu petunjuk (maksimal 30 karakter) di HP-nya,
   sementara pemain lain melihat "Menunggu [nama] mengetik...". Host memvalidasi petunjuk: harus giliran pengirim, belum mengirim di ronde itu,
   tidak sama dengan atau memuat kata rahasia pengirim (tanpa beda huruf besar/kecil, spasi, dan tanda baca), dan belum pernah dipakai di game itu.
   Galat hanya dikirim ke pemain itu. Tombol **Sudah bicara** menyelesaikan giliran tanpa mencatat apa pun ke riwayat.
   Host bisa **Lewati giliran** pemain yang tidak merespons, atau **Mulai voting sekarang**.
6. **Riwayat petunjuk** tampil di semua HP pada layar petunjuk, voting, dan hasil akhir: per pemain (R1, R2, ...) atau per ronde,
   dengan tanda dan peran untuk pemain yang sudah tereliminasi. Riwayat disimpan di state host, jadi pemain yang reconnect tetap menerimanya.
7. Setelah semua pemain hidup mendapat giliran, voting dimulai otomatis dari HP masing-masing
   dengan progres suara live. Hasil keluar otomatis saat semua suara masuk, atau saat host menutup voting.
8. **Lewati (abstain)**: setiap pemain boleh memilih **Lewati** saat voting (juga saat vote ulang). Lewati dihitung
   sudah vote, tetapi tidak menambah suara siapa pun. Jika Lewati lebih banyak dari suara terbanyak, atau tidak ada suara
   untuk siapa pun, tidak ada yang tereliminasi. Rekap suara menampilkan jumlah Lewati.
   **Aturan seri**: jika suara terbanyak seri (termasuk seri dengan Lewati), ada vote ulang sekali hanya antara yang seri.
   Jika masih seri, tidak ada yang tereliminasi dan game lanjut ke ronde berikutnya.
9. Mr. White yang tereliminasi menebak kata Civilian dari HP-nya sendiri (host bisa melewati jika dia tidak merespons).
10. Layar menang tampil di semua HP, lalu host bisa **Main lagi** atau kembali ke lobby. Skor room disimpan per nama.

### Cara kerja dan batasan (jujur)

- **Arsitektur**: host adalah sumber kebenaran (topologi bintang). Semua klien tersambung ke HP host lewat WebRTC DataChannel.
  Peer id host adalah `undercover-hn-<KODE>`.
- **Broker sinyal publik**: koneksi awal memakai broker gratis `0.peerjs.com`. Broker ini bisa melihat peer id dan alamat IP
  peserta (tidak melihat isi permainan, karena data game lewat koneksi P2P terenkripsi DTLS). Jika broker sedang down, mode online tidak bisa dipakai;
  mode satu HP tetap jalan.
- **Hanya STUN, tanpa TURN**: dipakai STUN publik Google (`stun.l.google.com`). Tanpa server TURN, sebagian jaringan bisa gagal tersambung,
  misalnya NAT simetris, Wi-Fi kantor/kampus dengan firewall ketat, dan sebagian operator seluler. Solusinya coba jaringan lain
  (mis. semua pemain di Wi-Fi yang sama, atau hotspot dari salah satu HP).
- **Host memegang semua kata**: HP host menyimpan state lengkap (termasuk kata semua pemain) di memori dan `localStorage`-nya.
  Host yang curang secara teknis bisa mengintip lewat DevTools. Klien hanya menerima kata miliknya sendiri.
- **Reconnect**: sesi (kode room, id pemain, token rahasia) disimpan di perangkat. Klien yang refresh, pindah aplikasi, atau putus jaringan
  otomatis bergabung lagi. Ada heartbeat, dan pemain yang terputus ditandai **Offline**.
- **Token sesi**: setiap pemain punya token acak yang hanya diketahui HP-nya dan host. Token tidak pernah dikirim ke pemain lain,
  jadi pemain lain tidak bisa mengambil alih kursi orang yang sedang offline. Pesan dari klien juga divalidasi (klien tidak bisa menjalankan aksi host).
- **Tidak ada migrasi host**: jika host menutup tab, room berhenti untuk semua. Jika host hanya refresh (atau membuka lagi dalam 6 jam di perangkat yang sama),
  room dilanjutkan dengan kode dan peer id yang sama, dan klien tersambung kembali otomatis.
- **Batas waktu opsional** (diatur host, ikut ke semua pemain): petunjuk per giliran 20/30/45/60 detik dan diskusi+vote
  30/60/90/120 detik. Bawaan **Tanpa batas**. Saat waktu habis, giliran petunjuk dilewati dengan tanda "(waktu habis)",
  vote langsung dihitung seperti tombol Hitung (yang belum memilih dianggap tidak memilih), dan tebakan Mr. White
  (minimal 30 detik) dianggap salah. Host mengirim sisa waktu, bukan jam, jadi beda jam antar HP tidak berpengaruh.

## Suara, getar, dan notifikasi giliran

Tombol speaker di pojok atas (beranda, layar game, dan room online) membuka pengaturan **Suara**, **Volume**, **Getar**, dan **Notifikasi giliran**.
Pengaturan disimpan di `localStorage` HP itu saja.

- **Suara** dibuat langsung di browser (Web Audio, tanpa file audio). Bunyi paling jelas, nada naik lima ketukan plus getar panjang,
  hanya untuk **giliranmu** memberi petunjuk dan untuk **Mr. White yang harus menebak**. Momen lain (pemain gabung, game mulai, voting,
  eliminasi, menang/kalah, chat, oper HP di mode satu HP) memakai bunyi pendek yang halus.
- **Mode satu HP**: ada isyarat saat HP harus dioper, saat kartu dibuka, dan saat giliran petunjuk pindah ke pemain berikutnya.
- **Notifikasi giliran** (opsional, perlu izin): muncul di HP **hanya saat giliranmu** dan halaman sedang tidak dilihat (pindah aplikasi
  atau layar lain). Tidak ada notifikasi untuk mulai, voting, hasil, chat, atau pemain gabung. Notifikasi ditampilkan lewat service worker
  kecil (`public/sw.js`, tanpa cache) dan otomatis ditutup saat giliran lewat atau halaman dibuka lagi. Judul tab juga berubah menjadi
  "(Giliranmu!)".
- **Batasan (jujur)**: ini bukan push dari server. Notifikasi hanya muncul selama room masih terbuka di latar. Jika aplikasi/tab sudah ditutup,
  tidak ada notifikasi. Android dapat memperlambat atau membekukan tab di latar setelah beberapa menit, sehingga notifikasi bisa terlambat atau
  tidak muncul. Di iPhone, notifikasi web hanya tersedia jika situs dipasang ke Layar Utama (iOS 16.4 ke atas), dan iOS menghentikan JavaScript
  tidak lama setelah aplikasi ke latar, jadi dalam praktiknya notifikasi paling andal di Android. iPhone tidak mendukung getar dari web.

## Cara main singkat (satu HP)

1. Isi 3 sampai 20 nama pemain, atur jumlah Undercover dan Mr. White, pilih kategori kata.
2. Oper HP ke setiap pemain. Pemain menekan tombol untuk melihat kata, lalu menutupnya sebelum mengoper.
   - **Civilian** mendapat kata A, **Undercover** mendapat kata B yang mirip. Keduanya tidak diberi tahu perannya.
   - **Mr. White** tidak mendapat kata dan melihat "Kamu Mr. White".
3. Petunjuk sesuai urutan giliran acak (giliran pertama bukan Mr. White): layar menampilkan "Giliran [nama]: ketik petunjukmu".
   Pemain mengetik petunjuknya (aturan validasi sama dengan mode online), atau menekan **Sudah bicara** untuk menyelesaikan giliran
   tanpa mencatat petunjuk, lalu HP dioper ke pemain berikutnya. Setelah giliran terakhir, voting dimulai otomatis.
4. Voting (dengan batas waktu opsional dan riwayat petunjuk) untuk mengeliminasi satu pemain, lalu peran pemain itu dibuka.
   Riwayat petunjuk juga tampil di layar hasil akhir.
   Jika Mr. White tereliminasi, dia boleh menebak kata Civilian. Tebakan benar berarti Mr. White menang.
5. Civilian menang jika semua Undercover dan Mr. White tereliminasi.
   Penyusup menang jika jumlah penyusup tersisa sama atau lebih banyak dari Civilian (termasuk saat tinggal 2 pemain).

Aturan setup: jumlah Civilian harus lebih banyak dari gabungan Undercover dan Mr. White. Mr. White boleh 0.

## Sumber kata

Di layar pengaturan (mode satu HP dan online) ada pilihan **Sumber kata**:

- **Internet** (bawaan): 3766 pasangan kata di 32 kategori (termasuk Game serta Anime & Animasi), diambil dari game
  Undercover publik di GitHub, lalu diterjemahkan (bila perlu) dan dikurasi manual ke bahasa Indonesia:
  - berlisensi terbuka: MASJV/undercover-game (MIT), antebrl/undercover-word-game (MIT), CK-Arena (Apache-2.0),
    sqiprasanna/mr-white-undercover (MIT), trk78/undercover-plus (MIT), srinath987/Undercover-clone (MIT),
    VM1235/undercover-word-game (MIT), ChairGamertag87/undercover (MIT), Nidroz/undercover (MIT),
    zhengyi-yang/WhoIsTheSpy (MIT), xuqssq/whois-undercover-game (MIT);
  - repo publik tanpa berkas lisensi: chud-lori/ethok, DaengWithAI/undercover-indonesia,
    Egi-Pebriyawan/game-undercover-indonesia, arisandi95/undercover-game-indonesia, tejasdasari06/Imposter-game,
    Schluby/Undercover, Bipash2002/undercover, Deepak-Ajay-Dubey/word-spy, ArashadDodhiya/UnderCoverGame,
    AmazinAmazon/Undercover, jishnurajendran/undercover.

  Rincian sumber, lisensi, dan jumlah pasangan per sumber ada di [ATRIBUSI.md](ATRIBUSI.md).
- **Kamus kita**: bank kata buatan sendiri (lihat di bawah).

Setiap sumber punya daftar kategori sendiri, dan pilihan kategori disimpan terpisah per sumber.
Di mode online, sumber kata diatur oleh host dan ikut tersinkron ke semua pemain.
Filter "Satu kata" berlaku untuk kedua sumber (untuk Internet, kedua kata pasangan harus satu kata).

Data Internet ada di `data/internet/`: sumber mentah dan lisensinya di `asli/`, terjemahan di `kurasi/*.txt`.
Setelah mengedit kurasi, jalankan `npm run words:internet` untuk membuat ulang `data/internet/*.ts`.

## Bank kata (Kamus kita)

Kata disimpan per kategori di `data/words/*.ts`. Setiap kategori punya subkategori berisi kata yang mirip.
Pasangan dibuat saat main: pilih kategori, pilih subkategori, lalu ambil 2 kata berbeda secara acak.
Jumlah kombinasi = jumlah C(n, 2) dari setiap subkategori, saat ini **1.607.365 kombinasi** dari
12.470 kata, 66 subkategori, 23 kategori. Kata yang kurang dikenal orang sudah dibuang, dan kata populer
(makanan, merek, tempat wisata, aplikasi, hero Mobile Legends terbaru, anime, film, game, penyanyi, klub) ditambahkan.
Ada juga 120 pasangan kurasi manual (kategori "Klasik").

- Data tiap kategori dimuat lazy (dynamic import) hanya saat permainan dimulai.
- Pasangan yang baru dipakai disimpan di riwayat dan dihindari.
- Sumber teks ada di `data/sumber/*.txt`. Setelah mengedit, jalankan `npm run words`
  (butuh Python 3) untuk membuat ulang `data/words/*.ts`.

## Pengembangan

```bash
npm install
npm run dev      # http://localhost:3000/undercover/
npm run lint
npm test         # vitest: logika game, reducer online, dan bank kata
npm run build    # hasil statis di folder out/
```

Struktur penting:

- `lib/game.ts`: logika murni (validasi setup, pembagian peran, urutan bicara, kondisi menang, tebakan Mr. White, generator pasangan).
- `lib/online/*.ts`: logika murni mode online (kode room, reducer host, view per pemain, aturan seri, validasi pesan), jaringan PeerJS, dan penyimpanan sesi.
- `components/App.tsx`: beranda pilihan mode. `components/OnlineGame.tsx`: UI mode online. `components/UndercoverGame.tsx`: UI mode satu HP.
- `components/ui.tsx`: komponen bersama (pengaturan peran, kategori, kartu balik, konfeti).
- Animasi CSS 150 sampai 350 ms di `app/globals.css`, otomatis dimatikan jika perangkat memakai `prefers-reduced-motion`.
- `data/words/`: bank kata hasil generator, `data/klasik.ts`: pasangan kurasi, `data/internet/`: sumber kata Internet.
- `tests/`: unit test.

## Deploy

Workflow `.github/workflows/deploy.yml` berjalan setiap push ke `master`: lint, test, build, lalu deploy folder `out/` ke GitHub Pages.
Pastikan di repo: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
