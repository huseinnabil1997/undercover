#!/usr/bin/env python3
"""Bangun data kata "Internet" dari file kurasi.

Sumber mentah ada di data/internet/asli/ (lisensi tiap sumber dicatat di
ATRIBUSI.md), terjemahan dan kurasi manual ada di data/internet/kurasi/*.txt.
Baris kurasi berbentuk 'A / B = TA / TB', atau 'A / B' bila sumbernya sudah
berbahasa Indonesia dan dipakai apa adanya. Skrip ini memastikan setiap
pasangan asli benar-benar ada di sumbernya, menolak terjemahan kembar dan
duplikat, lalu menulis data/internet/index.ts dan data/internet/pasangan.ts.

Pemakaian: python scripts/generate_internet.py [--cek]
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
ASLI = AKAR / "data" / "internet" / "asli"
KURASI = AKAR / "data" / "internet" / "kurasi"
KELUAR = AKAR / "data" / "internet"

LABEL_SUMBER = {
    "masjv": "MASJV/undercover-game (MIT)",
    "antebrl": "antebrl/undercover-word-game (MIT)",
    "ck": "CK-Arena (Apache-2.0)",
    "sqiprasanna": "sqiprasanna/mr-white-undercover (MIT)",
    "trk78": "trk78/undercover-plus (MIT)",
    "ethok": "chud-lori/ethok (tanpa lisensi)",
    "daeng": "DaengWithAI/undercover-indonesia (tanpa lisensi)",
    "egi": "Egi-Pebriyawan/game-undercover-indonesia (tanpa lisensi)",
    "arisandi": "arisandi95/undercover-game-indonesia (tanpa lisensi)",
    "deepak": "Deepak-Ajay-Dubey/word-spy (tanpa lisensi)",
    "tejas": "tejasdasari06/Imposter-game (tanpa lisensi)",
    "bipash": "Bipash2002/undercover (tanpa lisensi)",
    "arashad": "ArashadDodhiya/UnderCoverGame (tanpa lisensi)",
    "srinath": "srinath987/Undercover-clone (MIT)",
    "vm1235": "VM1235/undercover-word-game (MIT)",
    "jishnu": "jishnurajendran/undercover (tanpa lisensi)",
    "amazin": "AmazinAmazon/Undercover (tanpa lisensi)",
    "schluby": "Schluby/Undercover (tanpa lisensi)",
    "chair": "ChairGamertag87/undercover (MIT)",
    "nidroz": "Nidroz/undercover (MIT)",
    "zhengyi": "zhengyi-yang/WhoIsTheSpy (MIT)",
    "xuqssq": "xuqssq/whois-undercover-game (MIT)",
}

POLA_PASANGAN = re.compile(r'\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]')
TEKS_KUTIP = r"""["']([^"'\n]{1,60})["']"""


def pasangan_objek(teks, ka, kb):
    """Pasangan dari objek JS {ka: 'x', kb: 'y'} (urutan kunci bebas)."""
    hasil = []
    for m in re.finditer(r"\{[^{}]{0,600}\}", teks):
        o = m.group(0)
        a = re.search(r"[\"']?(?:" + ka + r")[\"']?\s*:\s*" + TEKS_KUTIP, o)
        b = re.search(r"[\"']?(?:" + kb + r")[\"']?\s*:\s*" + TEKS_KUTIP, o)
        if a and b:
            hasil.append((a.group(1), b.group(1)))
    return hasil


def baca_asli(nama):
    return (ASLI / nama).read_text(encoding="utf-8")


def json_asli(nama):
    return json.loads(baca_asli(nama))


def normal(s):
    """Huruf kecil, tanpa diakritik, spasi dirapikan: 'Crème' == 'creme'."""
    s = unicodedata.normalize("NFKD", s.strip())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).casefold()


def kunci(a, b):
    """Kunci pasangan tak berurutan, jadi 'A / B' sama dengan 'B / A'."""
    return frozenset((normal(a), normal(b)))


def blok_bahasa(teks, kode):
    """Ambil isi blok 'kode: [' atau 'kode: {' sampai blok bahasa berikutnya."""
    m = re.search(r"^\s*" + kode + r":\s*[\[{]", teks, re.M)
    if not m:
        raise SystemExit(f"blok bahasa '{kode}' tidak ditemukan")
    sisa = teks[m.end():]
    n = re.search(r"^\s*[a-z]{2}:\s*[\[{]", sisa, re.M)
    return sisa[:n.start()] if n else sisa


def muat_sumber(nama):
    """Kembalikan set pasangan asli (tak berurutan, case-insensitive)."""
    jenis, _, sub = nama.partition(":")
    hasil = set()
    if jenis == "masjv":
        data = json.loads((ASLI / "masjv-words.json").read_text(encoding="utf-8"))
        for p in data[sub]["pairs"]:
            hasil.add(kunci(p["c"], p["m"]))
    elif jenis == "antebrl":
        teks = (ASLI / "antebrl-wordPairs-en.ts.txt").read_text(encoding="utf-8")
        for a, b in POLA_PASANGAN.findall(teks):
            hasil.add(kunci(a, b))
    elif jenis == "ck":
        teks = (ASLI / "ck-arena" / f"{sub}.json").read_text(encoding="utf-8")
        for a, b in POLA_PASANGAN.findall(teks):
            hasil.add(kunci(a, b))
    elif jenis == "sqiprasanna":
        teks = (ASLI / "sqiprasanna-script.js.txt").read_text(encoding="utf-8")
        for a, b in POLA_PASANGAN.findall(teks):
            hasil.add(kunci(a, b))
    elif jenis == "trk78":
        teks = (ASLI / "trk78-data.js.txt").read_text(encoding="utf-8")
        for a, b in POLA_PASANGAN.findall(blok_bahasa(teks, "en")):
            hasil.add(kunci(a, b))
    elif jenis == "ethok":
        teks = (ASLI / "ethok-words.js.txt").read_text(encoding="utf-8")
        for a, b in POLA_PASANGAN.findall(blok_bahasa(teks, "id")):
            hasil.add(kunci(a, b))
    elif jenis == "daeng":
        for p in json.loads((ASLI / "daeng-pairs.json").read_text(encoding="utf-8")):
            hasil.add(kunci(p["c"], p["u"]))
    elif jenis == "egi":
        teks = (ASLI / "egi-seed_words.py.txt").read_text(encoding="utf-8")
        teks = teks[teks.index("pairs = ["):]
        teks = teks[:teks.index("\n]")]
        for a, b in re.findall(r'\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)', teks):
            hasil.add(kunci(a, b))
    elif jenis == "arisandi":
        teks = (ASLI / "arisandi95-DatabaseSeeder.php.txt").read_text(encoding="utf-8")
        for a, b in re.findall(r"\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'[a-z]+'\s*\]", teks):
            hasil.add(kunci(a, b))
    elif jenis == "deepak":
        for a, b in pasangan_objek(baca_asli("deepak-fallbackWords.ts.txt"), "civilian", "undercover"):
            hasil.add(kunci(a, b))
        for p in json_asli("deepak-curatedWords.json"):
            hasil.add(kunci(p["civilian"], p["undercover"]))
    elif jenis == "tejas":
        for a, b in pasangan_objek(baca_asli("tejas-wordPairs.ts.txt"), "crew", "imposter"):
            hasil.add(kunci(a, b))
    elif jenis == "bipash":
        for a, b in pasangan_objek(baca_asli("bipash-wordpairs.js.txt"), "civilian", "undercover"):
            hasil.add(kunci(a, b))
    elif jenis == "arashad":
        for p in json_asli("arashad-word-pairs.json"):
            hasil.add(kunci(p["citizen"], p["undercover"]))
    elif jenis == "srinath":
        for a, b in pasangan_objek(baca_asli("srinath-App.js.txt"), "civilian", "undercover"):
            hasil.add(kunci(a, b))
    elif jenis == "vm1235":
        for a, b in re.findall(r"\[\s*" + TEKS_KUTIP + r"\s*,\s*" + TEKS_KUTIP + r"\s*\]",
                               baca_asli("vm1235-wordPairs-en.ts.txt")):
            hasil.add(kunci(a, b))
    elif jenis == "jishnu":
        for baris in baca_asli("jishnu-words.txt").splitlines():
            m = re.match(r'\["([^"]+)"+,\s*"([^"]+)"\]', baris)
            if m:
                hasil.add(kunci(*m.groups()))
    elif jenis == "amazin":
        for p in json_asli("amazin-words_en.json"):
            hasil.add(kunci(p["citizen"], p["undercover"]))
    elif jenis == "schluby":
        # Sumber berbahasa Prancis; versi Inggris (civil_en) ikut dimuat.
        for berkas in sorted((ASLI / "schluby").glob("*.json")):
            for s in json.loads(berkas.read_text(encoding="utf-8"))["subthemes"]:
                for p in s["pairs"]:
                    hasil.add(kunci(p["civil"], p["imposteur"]))
                    if p.get("civil_en") and p.get("imposteur_en"):
                        hasil.add(kunci(p["civil_en"], p["imposteur_en"]))
    elif jenis == "chair":
        for tema in json_asli("chair-undercover_paires.json")["themes"]:
            for p in tema["paires"]:
                hasil.add(kunci(p["civil"], p["undercover"]))
    elif jenis == "nidroz":
        teks = baca_asli("nidroz-words.js.txt")
        for a, b in pasangan_objek(teks[teks.index("en: ["):], "civilian", "impostor"):
            hasil.add(kunci(a, b))
    elif jenis == "zhengyi":
        for baris in baca_asli("zhengyi-words-500.txt").splitlines():
            if "," in baris:
                a, b = baris.split(",", 1)
                hasil.add(kunci(a, b))
    elif jenis == "xuqssq":
        for p in json_asli("xuqssq-words.json"):
            hasil.add(kunci(p["common"], p["undercover"]))
    else:
        raise SystemExit(f"Sumber tidak dikenal: {nama}")
    return hasil


def baca_kurasi(berkas):
    kategori = None
    sumber = None
    pasangan = []
    galat = []
    cache = {}
    for no, baris in enumerate(berkas.read_text(encoding="utf-8").splitlines(), 1):
        baris = baris.strip()
        if not baris:
            continue
        if kategori is None:
            m = re.match(r"#\s*(i-[a-z0-9-]+)\s*\|\s*(.+)$", baris)
            if not m:
                raise SystemExit(f"{berkas.name}:{no}: header '# i-id | Nama' wajib di baris pertama")
            kategori = {"id": m.group(1), "nama": m.group(2).strip(), "sumber": []}
            continue
        if baris.startswith("#"):
            continue
        if baris.startswith("@"):
            sumber = baris[1:].strip()
            if sumber not in cache:
                cache[sumber] = muat_sumber(sumber)
            label = LABEL_SUMBER[sumber.split(":")[0]]
            if label not in kategori["sumber"]:
                kategori["sumber"].append(label)
            continue
        if sumber is None:
            raise SystemExit(f"{berkas.name}:{no}: baris '@ sumber' belum ada")
        try:
            asli, _, terjemahan = baris.partition(" = ")
            a, b = [x.strip() for x in asli.split(" / ")]
            ta, tb = [x.strip() for x in (terjemahan or asli).split(" / ")]
        except ValueError:
            raise SystemExit(f"{berkas.name}:{no}: format harus 'A / B = TA / TB' atau 'A / B': {baris}")
        if kunci(a, b) not in cache[sumber]:
            galat.append(f"{berkas.name}:{no}: pasangan asli tidak ada di {sumber}: {a} / {b}")
            continue
        pasangan.append((ta, tb, f"{berkas.name}:{no}", sumber.split(":")[0]))
    return kategori, pasangan, galat


def satu_kata(s):
    return not re.search(r"\s", s)


def main():
    cek = "--cek" in sys.argv
    semua = []
    galat = []
    terlihat = {}
    per_sumber = {}
    # Kategori umum (Campuran, Lain-lain) diproses terakhir supaya duplikat
    # tetap tinggal di kategori yang lebih spesifik.
    umum = ("i-campuran.txt", "i-lain.txt")
    urutan = sorted(KURASI.glob("*.txt"), key=lambda b: (b.name in umum, b.name))
    for berkas in urutan:
        kat, pasangan, g = baca_kurasi(berkas)
        galat.extend(g)
        bersih = []
        for ta, tb, lokasi, src in pasangan:
            if ta.casefold() == tb.casefold():
                galat.append(f"{lokasi}: terjemahan kembar: {ta} / {tb}")
                continue
            if "\u2014" in ta + tb:
                galat.append(f"{lokasi}: em dash dilarang")
                continue
            k = kunci(ta, tb)
            if k in terlihat:
                print(f"  lewati duplikat {lokasi}: {ta} / {tb} (sudah di {terlihat[k]})")
                continue
            terlihat[k] = lokasi
            per_sumber[src] = per_sumber.get(src, 0) + 1
            bersih.append([ta, tb])
        kat["pasangan"] = bersih
        semua.append(kat)
    if galat:
        print("\n".join(galat))
        raise SystemExit(f"{len(galat)} galat")
    ids = [k["id"] for k in semua]
    if len(ids) != len(set(ids)):
        raise SystemExit("id kategori ganda")
    semua.sort(key=lambda k: k["nama"].casefold())
    total = 0
    for k in semua:
        n = len(k["pasangan"])
        s = sum(1 for a, b in k["pasangan"] if satu_kata(a) and satu_kata(b))
        k["jumlah"], k["jumlahSatuKata"] = n, s
        total += n
        print(f"{k['id']:<22} {k['nama']:<26} {n:>4} pasangan ({s} satu kata)")
    print(f"TOTAL {total} pasangan di {len(semua)} kategori")
    for src, n in per_sumber.items():
        print(f"  {LABEL_SUMBER[src]}: {n} pasangan")
    if cek:
        return
    meta = [
        {"id": k["id"], "nama": k["nama"], "sumber": k["sumber"],
         "jumlah": k["jumlah"], "jumlahSatuKata": k["jumlahSatuKata"]}
        for k in semua
    ]
    kepala = "// File ini dibuat otomatis oleh scripts/generate_internet.py. Jangan diedit manual.\n"
    (KELUAR / "index.ts").write_text(
        kepala
        + "import type { KategoriInternetMeta } from '@/lib/types';\n\n"
        + "export const KATEGORI_INTERNET: KategoriInternetMeta[] = "
        + json.dumps(meta, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8", newline="\n")
    isi = {k["id"]: k["pasangan"] for k in semua}
    (KELUAR / "pasangan.ts").write_text(
        kepala
        + "export const PASANGAN_INTERNET: Record<string, [string, string][]> = "
        + json.dumps(isi, ensure_ascii=False) + ";\n",
        encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
