# Undercover: Tebak Kata

Game tebak kata **Undercover** untuk dimainkan bergiliran dalam **satu HP** (pass-and-play).
Dibuat dengan Next.js (App Router, static export) dan di-deploy ke GitHub Pages.

Live: https://huseinnabil1997.github.io/undercover/

- Tanpa backend, tanpa login, tanpa tracking/analytics.
- Semua data (nama pemain, skor, riwayat pasangan kata) hanya tersimpan di `localStorage` perangkat.
- Tampilan mobile-first (360 sampai 430 px), tombol besar, mendukung safe-area.

## Cara main singkat

1. Isi 3 sampai 20 nama pemain, atur jumlah Undercover dan Mr. White, pilih kategori kata.
2. Oper HP ke setiap pemain. Pemain menekan tombol untuk melihat kata, lalu menutupnya sebelum mengoper.
   - **Civilian** mendapat kata A, **Undercover** mendapat kata B yang mirip. Keduanya tidak diberi tahu perannya.
   - **Mr. White** tidak mendapat kata dan melihat "Kamu Mr. White".
3. Diskusi sesuai urutan bicara acak (pembicara pertama bukan Mr. White), dengan timer opsional.
4. Voting untuk mengeliminasi satu pemain, lalu peran pemain itu dibuka.
   Jika Mr. White tereliminasi, dia boleh menebak kata Civilian. Tebakan benar berarti Mr. White menang.
5. Civilian menang jika semua Undercover dan Mr. White tereliminasi.
   Penyusup menang jika jumlah penyusup tersisa sama atau lebih banyak dari Civilian (termasuk saat tinggal 2 pemain).

Aturan setup: jumlah Civilian harus lebih banyak dari gabungan Undercover dan Mr. White. Mr. White boleh 0.

## Bank kata

Kata disimpan per kategori di `data/words/*.ts`. Setiap kategori punya subkategori berisi kata yang mirip.
Pasangan dibuat saat main: pilih kategori, pilih subkategori, lalu ambil 2 kata berbeda secara acak.
Jumlah kombinasi = jumlah C(n, 2) dari setiap subkategori, saat ini **1.024.785 kombinasi** dari
8.683 kata, 43 subkategori, 20 kategori. Ada juga 120 pasangan kurasi manual (kategori "Klasik").

- Data tiap kategori dimuat lazy (dynamic import) hanya saat permainan dimulai.
- Pasangan yang baru dipakai disimpan di riwayat dan dihindari.
- Sumber teks ada di `data/sumber/*.txt`. Setelah mengedit, jalankan `npm run words`
  (butuh Python 3) untuk membuat ulang `data/words/*.ts`.

## Pengembangan

```bash
npm install
npm run dev      # http://localhost:3000/undercover/
npm run lint
npm test         # vitest: logika game dan bank kata
npm run build    # hasil statis di folder out/
```

Struktur penting:

- `lib/game.ts`: logika murni (validasi setup, pembagian peran, urutan bicara, kondisi menang, tebakan Mr. White, generator pasangan).
- `components/UndercoverGame.tsx`: seluruh UI game (client component).
- `data/words/`: bank kata hasil generator, `data/klasik.ts`: pasangan kurasi.
- `tests/`: unit test.

## Deploy

Workflow `.github/workflows/deploy.yml` berjalan setiap push ke `master`: lint, test, build, lalu deploy folder `out/` ke GitHub Pages.
Pastikan di repo: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
