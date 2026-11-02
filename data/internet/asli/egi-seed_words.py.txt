import random

pairs = [
    ("Kopi", "Teh"), ("Nasi Goreng", "Mie Goreng"), ("Burger", "Pizza"), ("Es Krim", "Gelato"),
    ("Susu", "Yogurt"), ("Apel", "Jeruk"), ("Roti", "Kue"), ("Soto", "Bakso"),
    ("Air Mineral", "Jus"), ("Cokelat", "Permen"), ("Kucing", "Anjing"), ("Harimau", "Singa"),
    ("Burung Hantu", "Elang"), ("Ikan", "Gurita"), ("Kelinci", "Hamster"), ("Kuda", "Keledai"),
    ("Ayam", "Bebek"), ("Sapi", "Kambing"), ("Kupu-kupu", "Lebah"), ("Ular", "Kadal"),
    ("Sekolah", "Kampus"), ("Rumah", "Apartemen"), ("Bandara", "Stasiun"), ("Perpustakaan", "Toko Buku"),
    ("Pantai", "Gunung"), ("Pasar", "Supermarket"), ("Bioskop", "Teater"), ("Kantor", "Bank"),
    ("Restoran", "Kafe"), ("Hotel", "Vila"), ("Dokter", "Perawat"), ("Polisi", "Tentara"),
    ("Guru", "Dosen"), ("Koki", "Pelayan"), ("Pilot", "Masinis"), ("Penulis", "Wartawan"),
    ("Artis", "Model"), ("Petani", "Nelayan"), ("Arsitek", "Insinyur"), ("Pengacara", "Hakim"),
    ("Ponsel", "Tablet"), ("Laptop", "Komputer"), ("Buku", "Majalah"), ("Pulpen", "Pensil"),
    ("Kipas Angin", "AC"), ("Mobil", "Motor"), ("Sepeda", "Skuter"), ("Jam Tangan", "Jam Dinding"),
    ("Lampu", "Lilin"), ("Gitar", "Piano"), ("Payung", "Jas Hujan"), ("Kacamata", "Lensa Kontak"),
    ("Tas", "Dompet"), ("Sepatu", "Sandal"), ("Topi", "Helm"), ("Kemeja", "Kaos"),
    ("Celana", "Rok"), ("Jas", "Jaket"), ("Dasi", "Syall"), ("Sarung Tangan", "Kaos Kaki"),
    ("Sabun", "Sampo"), ("Sikat Gigi", "Pasta Gigi"), ("Handuk", "Keset"), ("Cermin", "Sisir"),
    ("Bantal", "Guling"), ("Selimut", "Sprei"), ("Kasur", "Tikar"), ("Pintu", "Jendela"),
    ("Atap", "Lantai"), ("Dapur", "Kamar Mandi"), ("Piring", "Mangkok"), ("Sendok", "Garpu"),
    ("Gelas", "Cangkir"), ("Wajan", "Panci"), ("Pisau", "Gunting"), ("Kulkas", "Mesin Cuci"),
    ("Televisi", "Radio"), ("Kamera", "Teleskop"), ("Baterai", "Charger"), ("Remote", "Joystick"),
    ("Emas", "Perak"), ("Besi", "Baja"), ("Kayu", "Bambu"), ("Batu", "Pasir"),
    ("Tanah", "Lumpur"), ("Air", "Api"), ("Angin", "Awan"), ("Matahari", "Bulan"),
    ("Bintang", "Planet"), ("Hujan", "Salju"), ("Pagi", "Sore"), ("Siang", "Malam"),
    ("Musim Panas", "Musim Dingin"), ("Timur", "Barat"), ("Utara", "Selatan"), ("Kiri", "Kanan"),
    ("Atas", "Bawah"), ("Depan", "Belakang"), ("Cepat", "Lambat"), ("Keras", "Lunak"),
    ("Panas", "Dingin"), ("Manis", "Asin"), ("Pahit", "Asam"), ("Wangi", "Busuk"),
    ("Terang", "Gelap"), ("Bersih", "Kotor"), ("Baru", "Lama"), ("Mahal", "Murah"),
    ("Kaya", "Miskin"), ("Pintar", "Bodoh"), ("Berani", "Takut"), ("Senang", "Sedih"),
    ("Marah", "Tenang"), ("Capek", "Segar"), ("Sakit", "Sehat"), ("Hidup", "Mati"),
    ("Lari", "Jalan"), ("Lompat", "Terbang"), ("Berenang", "Menyelam"), ("Makan", "Minum"),
    ("Tidur", "Bangun"), ("Baca", "Tulis"), ("Dengar", "Bicara"), ("Lihat", "Raba"),
    ("Beli", "Jual"), ("Pinjam", "Kasih"), ("Datang", "Pergi"), ("Naik", "Turun"),
    ("Buka", "Tutup"), ("Tarik", "Dorong"), ("Angkat", "Lempar"), ("Tangkap", "Lepas"),
    ("Potong", "Sambung"), ("Lipat", "Gulung"), ("Cuci", "Jemur"), ("Masak", "Makan"),
    ("Sepak Bola", "Futsal"), ("Bola Basket", "Bola Voli"), ("Tenis", "Badminton"), ("Golf", "Biliar"),
    ("Catur", "Kartu"), ("Ludo", "Monopoli"), ("Gitar Listrik", "Bass"), ("Drum", "Simbal"),
    ("Biola", "Cello"), ("Seruling", "Saksofon"), ("Terompet", "Harmonika"), ("Lukisan", "Patung"),
    ("Puisi", "Novel"), ("Film", "Drama"), ("Konser", "Pesta"), ("Museum", "Galeri"),
    ("Taman", "Hutan"), ("Sungai", "Danau"), ("Laut", "Samudra"), ("Pulau", "Benua"),
    ("Gurun", "Sabana"), ("Gua", "Lembah"), ("Pelangi", "Kilat"), ("Gempa", "Banjir"),
    ("Robot", "Alien"), ("Sihir", "Sains"), ("Pahlawan", "Penjahat"), ("Raja", "Ratu"),
    ("Pangeran", "Putri"), ("Naga", "Dinosaurus"), ("Hantu", "Zombi"), ("Vampir", "Manusia Serigala"),
    ("Oksigen", "Karbon Dioksida"), ("Atom", "Molekul"), ("Sel", "Jaringan"), ("Otak", "Jantung"),
    ("Paru-paru", "Hati"), ("Lambung", "Usus"), ("Tulang", "Otot"), ("Darah", "Saraf"),
    ("Akar", "Batang"), ("Daun", "Bunga"), ("Buah", "Biji"), ("Hutan Bakau", "Hutan Hujan"),
    ("Kopi Hitam", "Latte"), ("Teh Hijau", "Teh Tarik"), ("Nasi Putih", "Nasi Kuning"), ("Rendang", "Opor"),
    ("Gudeg", "Rawon"), ("Pempek", "Otak-otak"), ("Sate Ayam", "Sate Kambing"), ("Martabak Manis", "Martabak Telur"),
    ("Klepon", "Onde-onde"), ("Cendol", "Dawet"), ("Kerupuk", "Emping"), ("Sambal Terasi", "Sambal Matah")
]

# Shuffle and pick some to repeat with variations or find more to reach 500
# For now let's just use these ~150 and duplicate some with prefix or something to show volume
# Actually, I'll just generate 500 unique-ish pairs by combining categories if needed
# but let's stick to quality over quantity for the first 200.

full_list = []
for p in pairs:
    full_list.append(f"('ID', '{p[0]}', '{p[1]}')")

sql = "INSERT INTO words_library (language, word_civilian, word_undercover) VALUES\n" + ",\n".join(full_list) + ";"

with open("seed_words.sql", "w") as f:
    f.write(sql)

print(f"Generated {len(full_list)} word pairs.")
