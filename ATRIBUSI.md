# Atribusi sumber kata

Game ini punya dua sumber kata yang bisa dipilih di layar pengaturan:

- **Internet** (bawaan): pasangan kata dari game Undercover publik di GitHub (daftar di bawah), diterjemahkan bila perlu dan dikurasi manual ke bahasa Indonesia.
- **Kamus kita**: bank kata buatan sendiri di `data/sumber/*.txt`.

## Sumber pihak ketiga

| Sumber | Lisensi | Berkas lisensi | Yang dipakai |
| --- | --- | --- | --- |
| [MASJV/undercover-game](https://github.com/MASJV/undercover-game) | MIT, Copyright (c) 2026 Jaiveer Trivedi | `data/internet/asli/LICENSE-MASJV-MIT.txt` | Daftar pasangan kata per kategori (`masjv-words.json`) |
| [antebrl/undercover-word-game](https://github.com/antebrl/undercover-word-game) | MIT, Copyright (c) 2025 Ante Brähler | `data/internet/asli/LICENSE-antebrl-MIT.txt` | Daftar pasangan kata bahasa Inggris (`antebrl-wordPairs-en.ts.txt`) |
| [CK-Arena](https://huggingface.co/datasets/Xushuhaha/CK-Arena) ([GitHub](https://github.com/Yeswolo/CK-Arena)) | Apache-2.0 | `data/internet/asli/LICENSE-CK-Arena-Apache-2.0.txt` | Pasangan kata benda per kategori (`ck-arena/*.json`) |
| [sqiprasanna/mr-white-undercover](https://github.com/sqiprasanna/mr-white-undercover) (commit 17c9834) | MIT, Copyright (c) 2026 sqiprasanna | `data/internet/asli/LICENSE-sqiprasanna-MIT.txt` | Daftar `WORD_PAIRS` bahasa Inggris (`sqiprasanna-script.js.txt`) |
| [trk78/undercover-plus](https://github.com/trk78/undercover-plus) (commit dc82f38) | MIT, Copyright (c) 2026 Timéo Jeannin | `data/internet/asli/LICENSE-trk78-MIT.txt` | Blok `en` di `DATABASE` (`trk78-data.js.txt`) |

### Repo publik tanpa berkas lisensi

Repo di bawah ini publik di GitHub tetapi tidak menyertakan berkas lisensi. Daftar katanya sudah berbahasa Indonesia,
jadi dipakai apa adanya (kecuali koreksi ejaan kecil) setelah dikurasi. Pemilik repo bisa meminta pasangannya dihapus
lewat issue di repo ini.

| Sumber | Lisensi | Yang dipakai |
| --- | --- | --- |
| [chud-lori/ethok](https://github.com/chud-lori/ethok) (commit f6d5f1f) | tanpa lisensi | Blok `id` di `words.js` (`ethok-words.js.txt`) |
| [DaengWithAI/undercover-indonesia](https://github.com/DaengWithAI/undercover-indonesia) (commit ec4da64) | tanpa lisensi | Daftar pasangan `{c, u}` di `api/migrate.ts`, disalin ke `daeng-pairs.json` |
| [Egi-Pebriyawan/game-undercover-indonesia](https://github.com/Egi-Pebriyawan/game-undercover-indonesia) (commit 787d032) | tanpa lisensi | Daftar `pairs` di `seed_words.py` (`egi-seed_words.py.txt`) |
| [arisandi95/undercover-game-indonesia](https://github.com/arisandi95/undercover-game-indonesia) (commit 2dcac99) | tanpa lisensi | Cuplikan daftar kata di `database/seeders/DatabaseSeeder.php` (`arisandi95-DatabaseSeeder.php.txt`) |

### Jumlah pasangan per sumber

Setelah buang duplikat (huruf besar, diakritik, dan urutan diabaikan) dan kurasi, data Internet berisi 1810 pasangan di 30 kategori:

| Sumber | Pasangan |
| --- | ---: |
| MASJV/undercover-game | 527 |
| DaengWithAI/undercover-indonesia | 424 |
| chud-lori/ethok | 333 |
| antebrl/undercover-word-game | 212 |
| CK-Arena | 158 |
| sqiprasanna/mr-white-undercover | 55 |
| Egi-Pebriyawan/game-undercover-indonesia | 52 |
| trk78/undercover-plus | 25 |
| arisandi95/undercover-game-indonesia | 24 |

Angka ini dicetak ulang oleh `scripts/generate_internet.py` setiap kali dijalankan.

Salinan mentah sumber disimpan apa adanya di `data/internet/asli/`.

## Perubahan yang dibuat

- Semua kata bukan bahasa Indonesia diterjemahkan manual ke bahasa Indonesia. Nama diri (tokoh, film, tempat terkenal) tetap memakai nama aslinya.
- Pasangan yang sulit diterjemahkan, sinonim, tidak masuk akal, salah ketik, ganda, terlalu asing, bernuansa SARA atau minuman keras, atau sekadar lawan kata dibuang.
- Duplikat dicek tanpa membedakan huruf besar, diakritik, dan urutan pasangan (`A / B` sama dengan `b / á`).
- Pasangan dikelompokkan ulang ke kategori berbahasa Indonesia. Setiap blok di `data/internet/kurasi/*.txt` mencatat sumber aslinya (baris `@ sumber`).
- Baris kurasi `A / B = TA / TB` berarti terjemahan; baris `A / B` saja berarti dipakai apa adanya.
- `scripts/generate_internet.py` memeriksa bahwa setiap pasangan asli memang ada di sumbernya, lalu membuat `data/internet/index.ts` dan `data/internet/pasangan.ts`.

Membuat ulang data Internet:

```bash
npm run words:internet          # atau: python scripts/generate_internet.py
python scripts/generate_internet.py --cek   # hanya memeriksa, tidak menulis berkas
```

Situs dan aplikasi komersial (misalnya toz-app, toolboxday, undercover.gg, imposter-game.com) tidak diambil.
Repo dengan lisensi copyleft (GPL/AGPL) dan daftar yang berisi kata tidak pantas juga tidak dipakai.
