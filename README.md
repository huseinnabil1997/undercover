# Undercover: Tebak Kata

Game tebak kata **Undercover** dengan dua mode:

- **Main Online**: setiap pemain memakai HP sendiri, tersambung realtime peer-to-peer (WebRTC lewat PeerJS).
- **Main di Satu HP**: pass-and-play, satu HP dioper bergiliran (tetap bisa dipakai tanpa internet setelah halaman terbuka).

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
8. **Aturan seri**: jika suara terbanyak seri, ada vote ulang sekali hanya antara yang seri.
   Jika masih seri (atau tidak ada suara sama sekali), tidak ada yang tereliminasi dan game lanjut ke ronde berikutnya.
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
- **Tidak ada timer diskusi** di mode online (timer opsional hanya ada di mode satu HP).

## Cara main singkat (satu HP)

1. Isi 3 sampai 20 nama pemain, atur jumlah Undercover dan Mr. White, pilih kategori kata.
2. Oper HP ke setiap pemain. Pemain menekan tombol untuk melihat kata, lalu menutupnya sebelum mengoper.
   - **Civilian** mendapat kata A, **Undercover** mendapat kata B yang mirip. Keduanya tidak diberi tahu perannya.
   - **Mr. White** tidak mendapat kata dan melihat "Kamu Mr. White".
3. Petunjuk sesuai urutan giliran acak (giliran pertama bukan Mr. White): layar menampilkan "Giliran [nama]: ketik petunjukmu".
   Pemain mengetik petunjuknya (aturan validasi sama dengan mode online), atau menekan **Sudah bicara** untuk menyelesaikan giliran
   tanpa mencatat petunjuk, lalu HP dioper ke pemain berikutnya. Setelah giliran terakhir, voting dimulai otomatis.
4. Voting (dengan timer opsional dan riwayat petunjuk) untuk mengeliminasi satu pemain, lalu peran pemain itu dibuka.
   Riwayat petunjuk juga tampil di layar hasil akhir.
   Jika Mr. White tereliminasi, dia boleh menebak kata Civilian. Tebakan benar berarti Mr. White menang.
5. Civilian menang jika semua Undercover dan Mr. White tereliminasi.
   Penyusup menang jika jumlah penyusup tersisa sama atau lebih banyak dari Civilian (termasuk saat tinggal 2 pemain).

Aturan setup: jumlah Civilian harus lebih banyak dari gabungan Undercover dan Mr. White. Mr. White boleh 0.

## Bank kata

Kata disimpan per kategori di `data/words/*.ts`. Setiap kategori punya subkategori berisi kata yang mirip.
Pasangan dibuat saat main: pilih kategori, pilih subkategori, lalu ambil 2 kata berbeda secara acak.
Jumlah kombinasi = jumlah C(n, 2) dari setiap subkategori, saat ini **1.143.300 kombinasi** dari
10.493 kata, 58 subkategori, 23 kategori. Ada juga 120 pasangan kurasi manual (kategori "Klasik").

Kategori terbaru: **Anime**, **Film**, dan **Game** (judul game populer, 133 hero Mobile Legends dengan ejaan resmi,
item/istilah MLBB, hero Dota 2 dan Honor of Kings, karakter Genshin Impact, agen Valorant, Pokemon).

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
- `data/words/`: bank kata hasil generator, `data/klasik.ts`: pasangan kurasi.
- `tests/`: unit test.

## Deploy

Workflow `.github/workflows/deploy.yml` berjalan setiap push ke `master`: lint, test, build, lalu deploy folder `out/` ke GitHub Pages.
Pastikan di repo: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
