"""Generator bank kata: membaca sumber teks (satu file per kategori) dan menulis data/words/*.ts.

Format sumber:
# id-kategori | Nama Kategori
## Nama Subkategori
kata, kata, kata

Pemakaian: python scripts/generate_words.py <folder-sumber>
"""
import json, os, re, sys

# Subkategori berisi nama (tokoh, judul, merek, tempat) boleh lebih dari satu kata.
# Subkategori kata umum wajib satu kata: tanpa spasi dan tanpa CamelCase tempelan.
NAMA_SUBKAT = {
    'Hero Mobile Legends', 'Item & Istilah Mobile Legends', 'Hero Dota 2', 'Karakter Genshin Impact',
    'Agen Valorant', 'Hero Honor of Kings', 'Pokemon', 'Karakter Anime', 'Judul Anime', 'Istilah Anime',
    'Karakter Film & Superhero', 'Film Hollywood', 'Film Indonesia', 'Film Animasi Disney & Pixar',
    'Serial TV & Drama', 'Atlet & Pesepak Bola', 'Klub Sepak Bola', 'Tokoh Sejarah Indonesia',
    'Penyanyi & Band Indonesia', 'Penyanyi & Grup Dunia', 'Provinsi', 'Aplikasi & Media Sosial',
    'Merek Mobil & Motor', 'Kota & Kabupaten', 'Kota Dunia', 'Negara', 'Judul Game Populer',
    'Tempat Wisata Indonesia',
}
CAMEL = re.compile(r'[a-z][A-Z]')

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), '..', 'data', 'words')
os.makedirs(out, exist_ok=True)

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

order = ['makanan', 'minuman', 'hewan', 'buah-sayur', 'profesi', 'tempat', 'kendaraan', 'olahraga',
         'benda-rumah', 'elektronik', 'pakaian', 'alam', 'tubuh', 'hobi', 'musik', 'hiburan', 'film', 'anime', 'game',
         'daerah', 'budaya', 'sekolah', 'negara']
cats = {}
for fn in os.listdir(src):
    if not fn.endswith('.txt'):
        continue
    cid = name = None
    subs = []
    for line in open(os.path.join(src, fn), encoding='utf-8-sig'):
        line = line.strip()
        if line.startswith('## '):
            subs.append({'nama': line[3:].strip(), 'kata': []})
        elif line.startswith('# '):
            cid, name = [p.strip() for p in line[2:].split('|')]
        elif line and subs:
            subs[-1]['kata'] += [w.strip() for w in line.split(',') if w.strip()]
    for s in subs:
        if s['nama'] not in NAMA_SUBKAT:
            salah = [w for w in s['kata'] if ' ' in w or CAMEL.search(w)]
            if salah:
                sys.exit(f"{fn} / {s['nama']}: kata umum harus satu kata: {', '.join(salah[:10])}")
        seen, clean = set(), []
        for w in s['kata']:
            w = re.sub(r'\s+', ' ', w)
            if w.lower() not in seen:
                seen.add(w.lower()); clean.append(w)
        s['kata'] = clean
        s['id'] = cid + '--' + slug(s['nama'])
    cats[cid] = {'id': cid, 'nama': name, 'subkategori': subs}

ids = [c for c in order if c in cats] + sorted(c for c in cats if c not in order)
for cid in ids:
    c = cats[cid]
    body = json.dumps(c, ensure_ascii=False, indent=1)
    with open(os.path.join(out, f'{cid}.ts'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Berkas ini dihasilkan oleh scripts/generate_words.py. Edit sumbernya lalu jalankan ulang.\n')
        f.write("import type { Kategori } from '../../lib/types';\n\n")
        f.write(f'const kategori: Kategori = {body};\n\nexport default kategori;\n')

meta = []
for cid in ids:
    c = cats[cid]
    meta.append({'id': cid, 'nama': c['nama'],
                 'subkategori': [{'id': s['id'], 'nama': s['nama'], 'jumlahKata': len(s['kata'])} for s in c['subkategori']]})
with open(os.path.join(out, 'index.ts'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Berkas ini dihasilkan oleh scripts/generate_words.py. Jangan diedit manual.\n')
    f.write("import type { Kategori, KategoriMeta } from '../../lib/types';\n\n")
    f.write('export const META_KATEGORI: KategoriMeta[] = ' + json.dumps(meta, ensure_ascii=False, indent=1) + ';\n\n')
    f.write('export const PEMUAT_KATEGORI: Record<string, () => Promise<{ default: Kategori }>> = {\n')
    for cid in ids:
        f.write(f"  '{cid}': () => import('./{cid}'),\n")
    f.write('};\n')
total = sum(len(s['kata']) * (len(s['kata']) - 1) // 2 for c in cats.values() for s in c['subkategori'])
print('kategori', len(cats), 'subkategori', sum(len(c['subkategori']) for c in cats.values()),
      'kata', sum(len(s['kata']) for c in cats.values() for s in c['subkategori']), 'kombinasi', total)
