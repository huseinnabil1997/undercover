#!/usr/bin/env python3
"""Bangun data kata "Internet" dari file kurasi.

Sumber mentah (berlisensi bebas) ada di data/internet/asli/, terjemahan dan
kurasi manual ada di data/internet/kurasi/*.txt. Skrip ini memastikan setiap
pasangan asli benar-benar ada di sumbernya, menolak terjemahan kembar dan
duplikat, lalu menulis data/internet/index.ts dan data/internet/pasangan.ts.

Pemakaian: python scripts/generate_internet.py [--cek]
"""
import json
import re
import sys
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
ASLI = AKAR / "data" / "internet" / "asli"
KURASI = AKAR / "data" / "internet" / "kurasi"
KELUAR = AKAR / "data" / "internet"

LABEL_SUMBER = {
    "masjv": "MASJV/undercover-game (MIT)",
    "antebrl": "antebrl/undercover-word-game (MIT)",
    "ck": "CK-Arena (Apache-2.0)",
}

POLA_PASANGAN = re.compile(r'\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]')


def kunci(a, b):
    return frozenset((a.strip().casefold(), b.strip().casefold()))


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
            asli, terjemahan = baris.split(" = ")
            a, b = [x.strip() for x in asli.split(" / ")]
            ta, tb = [x.strip() for x in terjemahan.split(" / ")]
        except ValueError:
            raise SystemExit(f"{berkas.name}:{no}: format harus 'A / B = TA / TB': {baris}")
        if kunci(a, b) not in cache[sumber]:
            galat.append(f"{berkas.name}:{no}: pasangan asli tidak ada di {sumber}: {a} / {b}")
            continue
        pasangan.append((ta, tb, f"{berkas.name}:{no}"))
    return kategori, pasangan, galat


def satu_kata(s):
    return not re.search(r"\s", s)


def main():
    cek = "--cek" in sys.argv
    semua = []
    galat = []
    terlihat = {}
    # Kategori umum (Campuran, Lain-lain) diproses terakhir supaya duplikat
    # tetap tinggal di kategori yang lebih spesifik.
    umum = ("i-campuran.txt", "i-lain.txt")
    urutan = sorted(KURASI.glob("*.txt"), key=lambda b: (b.name in umum, b.name))
    for berkas in urutan:
        kat, pasangan, g = baca_kurasi(berkas)
        galat.extend(g)
        bersih = []
        for ta, tb, lokasi in pasangan:
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
