# Atribusi sumber kata

Game ini punya dua sumber kata yang bisa dipilih di layar pengaturan:

- **Internet** (bawaan): pasangan kata dari proyek terbuka di bawah ini, diterjemahkan dan dikurasi manual ke bahasa Indonesia.
- **Kamus kita**: bank kata buatan sendiri di `data/sumber/*.txt`.

## Sumber pihak ketiga

| Sumber | Lisensi | Berkas lisensi | Yang dipakai |
| --- | --- | --- | --- |
| [MASJV/undercover-game](https://github.com/MASJV/undercover-game) | MIT, Copyright (c) 2026 Jaiveer Trivedi | `data/internet/asli/LICENSE-MASJV-MIT.txt` | Daftar pasangan kata per kategori (`masjv-words.json`) |
| [antebrl/undercover-word-game](https://github.com/antebrl/undercover-word-game) | MIT, Copyright (c) 2025 Ante Brähler | `data/internet/asli/LICENSE-antebrl-MIT.txt` | Daftar pasangan kata bahasa Inggris (`antebrl-wordPairs-en.ts.txt`) |
| [CK-Arena](https://huggingface.co/datasets/Xushuhaha/CK-Arena) ([GitHub](https://github.com/Yeswolo/CK-Arena)) | Apache-2.0 | `data/internet/asli/LICENSE-CK-Arena-Apache-2.0.txt` | Pasangan kata benda per kategori (`ck-arena/*.json`) |

Salinan mentah sumber disimpan apa adanya di `data/internet/asli/`.

## Perubahan yang dibuat

- Semua kata bukan bahasa Indonesia diterjemahkan manual ke bahasa Indonesia. Nama diri (tokoh, film, tempat terkenal) tetap memakai nama aslinya.
- Pasangan yang sulit diterjemahkan, terlalu mirip setelah diterjemahkan, ganda, atau kurang cocok untuk pemain Indonesia dibuang.
- Pasangan dikelompokkan ulang ke kategori berbahasa Indonesia. Setiap blok di `data/internet/kurasi/*.txt` mencatat sumber aslinya (baris `@ sumber`).
- `scripts/generate_internet.py` memeriksa bahwa setiap pasangan asli memang ada di sumbernya, lalu membuat `data/internet/index.ts` dan `data/internet/pasangan.ts`.

Membuat ulang data Internet:

```bash
npm run words:internet          # atau: python scripts/generate_internet.py
python scripts/generate_internet.py --cek   # hanya memeriksa, tidak menulis berkas
```

Sumber lain yang tidak berlisensi terbuka tidak disalin.
