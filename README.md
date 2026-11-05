# Undercover: Tebak Kata

Game tebak kata **Undercover** dengan dua mode:

- **Main Online**: setiap pemain memakai HP sendiri, tersambung lewat Supabase Realtime (cadangan: WebRTC PeerJS, Metered, MQTT).
- **Main di Satu HP**: pass-and-play, satu HP dioper bergiliran (tetap bisa dipakai tanpa internet setelah halaman terbuka).
  Saat voting, kelompok bisa memilih **Lewati**: tidak ada yang tereliminasi dan permainan lanjut ke ronde berikutnya.

Dibuat dengan Next.js (App Router, static export) dan di-deploy ke GitHub Pages.

Live: https://huseinnabil1997.github.io/undercover/

- Tanpa backend, tanpa login, tanpa tracking/analytics.
- Data (nama pemain, skor, riwayat pasangan kata, sesi room) hanya tersimpan di `localStorage`/`sessionStorage` perangkat.
- Tampilan mobile-first (360 sampai 430 px), tombol besar, mendukung safe-area.

## Akun, profil, dan statistik (Supabase)

- Main **Lokal** (satu HP) tanpa login dan tidak dicatat.
- Main **Online** wajib login (username + password). Nama di room = username. Hasil tiap pemain dicatat ke profilnya.
- Username 3 sampai 20 karakter (huruf, angka, `_`), unik tanpa beda besar kecil. Password minimal 6 karakter, tidak bisa dipulihkan (tidak ada reset), bisa diganti saat login.
- Menu **Profil**: total main, persentase menang total dan per peran, riwayat permainan, cari pemain, ganti username (sekali per 7 hari, lewat RPC `ganti_username` yang juga mengganti email login sintetis; statistik, riwayat, kamus, dan foto tetap karena terikat id; nama di room yang sedang berjalan tetap nama lama), ganti password, keluar.
- Foto profil (Supabase Storage, bucket publik `avatars`, hanya pemilik yang bisa mengunggah/menghapus di folder `<user_id>/`): dipotong persegi, 256 px, WebP (cadangan JPEG), di bawah 100 KB. Tanpa foto tampil inisial berwarna.
- Profil pemain lain (read-only) bisa dibuka dari daftar pemain di room, layar hasil, dan pencarian username.
- Backend: Supabase (Auth + Postgres dengan RLS). Skema di `supabase/migrations`. Kunci yang ditanam di kode hanya kunci publishable; bisa diganti lewat `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Pengaturan project yang wajib: Authentication > Sign In / Providers > Email > matikan "Confirm email" (username diubah ke email sintetis `@undercover.local` yang tidak pernah dikirimi surat).
- Hasil online dicatat oleh **host** untuk semua pemain lewat RPC `catat_hasil_room`: hanya host room yang sedang aktif, hanya untuk anggota room yang identitasnya sudah diverifikasi server, minimal 3 pemain, sekali per permainan per akun. Pemain tidak bisa lagi menulis riwayat sendiri (insert langsung ke `riwayat_main` dicabut).
- Batasan: game tetap dijalankan di HP host, jadi host adalah pihak yang dipercaya. Host yang memodifikasi aplikasi (atau bersekongkol dengan akun lain di room yang sama) bisa memalsukan hasil di room itu, tetapi tidak bisa menulis untuk akun yang tidak pernah gabung ke room-nya.
- **Single login** (satu akun satu perangkat, login terbaru menang): setelah masuk atau daftar, klien memanggil `auth.signOut({ scope: 'others' })` sehingga sesi akun itu di perangkat lain dihapus dari `auth.sessions`. Helper `privat.sesi_aktif()` memeriksa `session_id` di JWT masih ada di `auth.sessions`; `privat.wajib_sesi_aktif()` dipanggil di awal RPC room, match, `catat_hasil_room`, dan `ganti_username`, dan policy tulis `kamus_pemain`, `profil`, serta avatar ikut memeriksanya, jadi access token lama ditolak walau belum kedaluwarsa. `tinggalkan_room` dan `keluar_match` sengaja tidak dicek agar perangkat yang dikeluarkan bisa pergi dengan rapi. Klien memanggil RPC `cek_sesi_aktif` tiap 5 detik saat halaman terlihat dan saat fokus; bila sesi sudah digantikan, perangkat keluar dari room/match, logout lokal, dan menampilkan pemberitahuan. Batasan: pengguna yang sudah login di beberapa perangkat sebelum fitur ini baru saling mengeluarkan saat salah satunya login lagi.

## Peringkat dan kamus pemain

- **Peringkat** (menu Peringkat, perlu login): 50 pemain teratas, lengkap dengan avatar. Urutkan menurut *Jumlah menang* (seri: main lebih sedikit, lalu username) atau *Winrate* (minimal 5 kali main; seri: menang lebih banyak, lalu main lebih banyak, lalu username), untuk *Keseluruhan* atau per peran (Civilian, Undercover, Mr. White). Pilihan tersimpan di perangkat. Ketuk nama untuk membuka profil pemain itu. Data dari view `papan_peringkat_peran` (hanya untuk pengguna login).
- **Kamus pemain** (menu Kamus): siapa pun bisa membaca daftar pasangan kata tanpa login. Menambah, mengubah, dan menghapus pasangan milik sendiri perlu login (dijaga RLS di tabel `kamus_pemain`).
- Validasi di HP dan di database: 2 sampai 30 karakter per kata, huruf/angka/spasi dan tanda - ' . &, kedua kata harus berbeda, pasangan duplikat ditolak walau urutan atau besar kecil huruf beda. Maksimal 300 pasangan per akun.
- Mode Lokal dan Online: pasangan kamus pemain otomatis digabung ke sumber **Kamus kita** dan **Internet**. Kategori pemain yang namanya sama dengan kategori bawaan (tanpa beda besar kecil huruf dan spasi) masuk ke kategori itu; nama baru tampil sebagai kategori baru bertanda *pemain* (id `p:<nama>`). Pasangan yang sudah ada di bawaan (dibalik atau beda huruf) dibuang. Di Online, host memuat kamus (cache 10 menit) saat menyiapkan kata; bila gagal, permainan tetap jalan dengan cache lama atau kata bawaan. Setelan lama *Pakai kamus pemain* dihapus otomatis.

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

### Cari match (matchmaking)

- Di menu Online (wajib login) ada **Cari match**: pilih **maksimal** pemain room 4 sampai 8, atau **Acak**.
- Room match terbuka dicatat di tabel `room_match` (kode, maks, status `lobby`/`dimulai`, waktu pemain terakhir gabung) dan `anggota_match` (satu kursi per akun, dengan detak). Kedua tabel hanya bisa diakses lewat RPC SECURITY DEFINER `cari_match`, `detak_match`, `mulai_match`, `keluar_match` (RLS aktif tanpa policy, tanpa grant ke anon).
- Penempatan atomik (advisory lock, tidak pernah melebihi maks): ukuran N masuk room `lobby` tertua dengan maks N yang belum penuh; Acak masuk room `lobby` mana saja yang belum penuh, paling ramai lalu paling lama. Bila tidak ada, dibuat room baru (maks N, atau 8 untuk Acak) dan pemain itu jadi host lalu membuat room biasa lewat `buat_room`, jadi relay, verifikasi identitas, migrasi host, pencatatan hasil, dan kedaluwarsa tetap sama.
- Saat host memulai game, room ditandai `dimulai` dan tidak menerima pemain matchmaking baru (pemain berikutnya mendapat room baru).
- Mulai otomatis saat room penuh, atau setelah **60 detik** tanpa pemain baru bila sudah minimal 4 (lobby menampilkan "Menunggu pemain j/maks" dan hitung mundur). Host juga bisa menekan Mulai sejak 4 pemain.
- Room yang dibuat pemain **Acak** (maks 8, kolom `room_match.acak`) **tidak pernah** mulai otomatis, baik saat penuh maupun setelah 60 detik: hanya host yang memulai, dan lobby menulis "Host yang memulai" tanpa hitung mundur. Mode disimpan di server sehingga host pengganti tetap mengikutinya. Pemain Acak yang masuk room ukuran tetap mengikuti aturan room itu.
- Kursi dibebaskan saat pemain keluar dari room, menutup halaman (keepalive), atau tidak berdetak 30 detik (detak tiap 5 detik). Room yang tidak punya anggota berdetak dalam 15 detik tidak menerima pemain baru; room tanpa anggota atau lebih dari 6 jam dihapus. Bila pemain gagal masuk karena host sudah pergi, kursinya dilepas dan pencarian diulang otomatis. Host yang pergi digantikan lewat migrasi host biasa.
- Pengaturan room match: komposisi bawaan sesuai jumlah pemain saat mulai (Mr. White mulai 5 pemain), petunjuk 45 detik, vote 60 detik.
- **Sumber kata room match** diatur host di lobby selama menunggu pemain: **Campur** (Kamus kita atau Internet diacak tiap game, semua kategori termasuk kamus pemain) atau **Pilih sendiri** (pilihan sumber dan kategori yang sama dengan room biasa, plus panjang kata). Pemain lain melihatnya tanpa bisa mengubah. Bawaan: pilihan host terakhir (`undercover:sumberMatchCampur`, lalu sumber kata terakhir), selain itu Campur. Pilihan ada di `Pengaturan.sumberCampur` dalam state host, jadi ikut tersinkron ke pemain dan ke snapshot migrasi host; mulai otomatis memakai pilihan host saat itu. State lama tanpa field ini dianggap Campur.

### Cara kerja dan batasan (jujur)

- **Arsitektur**: host adalah sumber kebenaran (topologi bintang). Jalur utama adalah **Supabase Realtime** (broadcast di channel
  privat `uc:<topik>`, RLS di `realtime.messages` hanya mengizinkan pengguna login yang menjadi anggota room). Isi pesan tetap
  dienkripsi AES-GCM dengan kunci turunan kode room. Jalur cadangan: PeerJS (WebRTC langsung), Metered, dan MQTT publik.
  Peer id host adalah `undercover-hn-<KODE>`.
- **Verifikasi identitas**: saat gabung, pemain memanggil `gabung_room` dan mendapat nonce sekali pakai. Host menukar nonce itu lewat
  `verifikasi_pemain` dan hanya menerima pemain bila username akun cocok dengan nama yang dikirim. Akun yang sama dari HP lain kembali ke kursi lamanya.
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
- **Host pindah otomatis**: host mengirim detak dan snapshot state terenkripsi (AES-GCM, kunci dari kode room, server tidak bisa membacanya)
  ke tabel `room_online` setiap ada perubahan. Jika host keluar (dialog Keluar) atau tidak berdetak selama 15 detik, satu pemain anggota
  room mengambil alih lewat `ambil_alih_host` (terkunci di server, hanya satu yang menang), memulihkan snapshot, dan permainan lanjut.
  Host lama yang kembali menjadi pemain biasa. Catatan: host baru tentu memegang state lengkap (termasuk kata semua pemain), sama seperti host lama.
  Snapshot hanya bisa diambil anggota room, dan hanya oleh yang menjadi host.
- **Room persisten dan pembersihan**: room di server kedaluwarsa 6 jam setelah detak terakhir. Room kedaluwarsa dihapus otomatis
  (fungsi `bersihkan_room`, dipanggil saat room baru dibuat). Tabel room tidak bisa dibaca atau ditulis langsung oleh klien; semua lewat RPC.
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
