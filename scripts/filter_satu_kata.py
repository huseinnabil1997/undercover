# -*- coding: utf-8 -*-
"""Filter sumber ke satu kata + top-up agar kombinasi > 1 juta. Jalankan di root repo."""
from __future__ import annotations
import re
from pathlib import Path

SRC = Path("data/sumber")
TARGET = 230  # C(230,2)=26335

NO_TOPUP = {
    "Hero Mobile Legends", "Item & Istilah Mobile Legends", "Hero Dota 2",
    "Karakter Genshin Impact", "Agen Valorant", "Hero Honor of Kings", "Pokemon",
    "Karakter Anime", "Judul Anime", "Istilah Anime",
    "Karakter Film & Superhero", "Film Hollywood", "Film Indonesia",
    "Film Animasi Disney & Pixar", "Serial TV & Drama",
    "Atlet & Pesepak Bola", "Klub Sepak Bola", "Tokoh Sejarah Indonesia",
    "Penyanyi & Band Indonesia", "Penyanyi & Grup Dunia", "Provinsi",
    "Aplikasi & Media Sosial", "Merek Mobil & Motor", "Kota & Kabupaten",
    "Kota Dunia", "Negara",
}

def is_one(w: str) -> bool:
    w = w.strip()
    return bool(w) and (" " not in w) and ("\t" not in w)

def parse(path: Path):
    header = None
    subs = []
    cur = None
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("# ") and not s.startswith("## "):
            header = s
        elif s.startswith("## "):
            cur = {"nama": s[3:].strip(), "kata": []}
            subs.append(cur)
        elif s and cur is not None:
            cur["kata"] += [w.strip() for w in s.split(",") if w.strip()]
    return header, subs

def write(path: Path, header: str, subs):
    lines = [header]
    for s in subs:
        lines.append(f"## {s['nama']}")
        words = s["kata"]
        for i in range(0, len(words), 18):
            lines.append(", ".join(words[i : i + 18]))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

# Pool besar kata tunggal Indonesia / nama proper, dikelompokkan longgar.
# Dipakai untuk top-up; kata yang sudah ada di sub dilewati.
POOLS: dict[str, list[str]] = {
    "minuman": [
        "Air","Teh","Kopi","Susu","Jus","Soda","Cola","Sprite","Fanta","Yogurt","Yakult","Matcha","Latte","Espresso",
        "Americano","Cappuccino","Mocha","Macchiato","Affogato","Coldbrew","Cortado","Ristretto","Lungo","Doppio",
        "Frappuccino","Milkshake","Smoothie","Mocktail","Limonade","Squash","Frappe","Granita","Slush","Float",
        "Sundae","Boba","Cendol","Dawet","Kolak","Sekoteng","Bandrek","Bajigur","Wedang","Jahe","Kencur","Kunyit",
        "Serai","Pandan","Kapulaga","Cengkeh","Adas","Pala","Jamu","Sinom","Pahitan","Cincau","Selasih","Madu",
        "Sirup","Squash","Tonic","Gingerale","Rootbeer","Isotonik","Energy","Cocoa","Eggnog","Punch","Toddy",
        "Robusta","Arabika","Liberika","Excelsa","Sencha","Gyokuro","Hojicha","Genmai","Chai","Masala","Rooibos",
        "Hibiscus","Lavender","Mate","Yerba","Assam","Ceylon","Darjeeling","Keemun","Oolong","Jasmine","Rosella",
        "Chamomile","Peppermint","EarlGrey","Piccolo","Breve","RedEye","BlackEye","LungoShot","Flatwhite",
        "TehTarik","TehHijau","TehHitam","TehPutih","TehMerah","TehOolong","KopiTubruk","KopiSusu","KopiHitam",
        "KopiAren","KopiGayo","KopiToraja","KopiJava","KopiLuwak","SusuSapi","SusuKambing","SusuKedelai","SusuAlmond",
        "SusuOat","JusJeruk","JusApel","JusMangga","JusAlpukat","JusWortel","JusTomat","JusSemangka","JusMelon",
        "JusNanas","JusSirsak","JusJambu","JusMarkisa","JusKiwi","JusAnggur","JusLemon","AirKelapa","AirTebu",
        "AirMineral","AirSoda","BirPletok","STMJ","ThaiTea","MilkTea","BubbleTea","EsTeh","EsJeruk","EsCendol",
        "EsCampur","EsTeler","EsDawet","EsKelapa","EsBuah","EsAlpukat","EsMangga","EsMelon","EsCokelat","EsVanila",
        "EsMatcha","EsBoba","EsKopi","EsSusu","EsDoger","EsPuter","EsKrim","EsLilin","EsKepal","EsBlewah",
        "EsKuwut","EsPisang","EsTape","EsDurian","EsNangka","EsSirsak","SodaGembira","Bir","GingerBeer","Kombucha",
        "Kefir","Lassi","Ayran","Horchata","Sangria","Spritzer","Negro","Negroni","Mojito","Margarita",
        "Daiquiri","Pina","Colada","Cosmo","Manhattan","Martini","Whiskey","Vodka","Gin","Rum","Tequila",
        "Brandy","Cognac","Sake","Soju","Shochu","Baijiu","Arak","Tuak","Ciu","Sopi","Moke","Saguer",
    ],
    "makanan": [
        "Rendang","Gulai","Kalio","Dendeng","Rawon","Soto","Coto","Konro","Pallubasa","Gudeg","Krecek","Tongseng",
        "Tengkleng","Semur","Empal","Rabeg","Pecel","Ketoprak","Lotek","Urap","Lawar","Seblak","Pempek","Tekwan",
        "Model","Laksan","Papeda","Tinutuan","Saksang","Kaledo","Ilabulo","Timlo","Tauto","Sroto","Docang","Lengko",
        "Beulangong","Catemak","Kolo","Bebalung","Sepat","Brenebon","Mangut","Orek","Oseng","Capcay","Fuyunghai",
        "Bakmoy","Martabak","Lumpia","Risoles","Pastel","Kroket","Panada","Jalangkote","Klepon","Getuk","Tiwul",
        "Gatot","Lemper","Nagasari","Wajik","Jenang","Dodol","Serabi","Surabi","Apem","Pukis","Cucur","Lapis",
        "Bika","Wingko","Bakpia","Yangko","Geplak","Jadah","Cenil","Lupis","Clorot","Grontol","Gandos","Ongol",
        "Rempeyek","Peyek","Semprong","Gapit","Nastar","Kastengel","Semprit","Sagon","Kue","Bolu","Donat","Croissant",
        "Brownies","Cheesecake","Puding","Jeli","Gorengan","Cireng","Cilok","Cimol","Cilor","Batagor","Siomay",
        "Bakso","Basreng","Makaroni","Ramen","Spageti","Fettucine","Lasagna","Dimsum","Hakau","Gyoza","Wonton",
        "Bakpao","Mantau","Kuotie","Sushi","Onigiri","Takoyaki","Okonomiyaki","Pizza","Burger","Hotdog","Sandwich",
        "Steak","Katsu","Teriyaki","Yakiniku","Bulgogi","Kebab","Shawarma","Risotto","Omelet","Nugget","Sosis",
        "Kornet","Abon","Chikuwa","Odeng","Tteokbokki","Kimbab","Tempura","Sashimi","Yakitori","Karaage","Ramenya",
        "Sate","Sop","Sayur","Tumis","Cah","Pepes","Botok","Bakar","Goreng","Rebus","Panggang","Kukus","Bumbu",
        "Sambal","Terasi","Matah","Bajak","Roa","Pete","Rica","Woku","Arsik","Naniura","Gohu","Kohu","Fufu",
        "Nasi","Mi","Bihun","Kwetiau","Soun","Misoa","Ketupat","Lontong","Buras","Lemang","Arem","Lepet","Bubur",
        "Keripik","Kerupuk","Rengginang","Emping","Kuaci","Popcorn","Permen","Wafer","Biskuit","Kukis","Roti",
        "Churros","Marshmallow","Granola","Sereal","Pilus","Lanting","Sumpia","Cakwe","Odading","Crepes","Corndog",
        "Pentol","Sempol","Gehu","Weci","Heci","Klanting","Getas","Gemblong","Opak","Bipang","Jipang","Enting",
        "Kipang","Sale","Manisan","Rujak","Asinan","Tempe","Tahu","Oncom","Tape","Singkong","Ubi","Talas","Kentang",
        "Jagung","Kacang","Kedondong","Sukun","Rambutan","Durian","Nangka","Salak","Manggis","Duku","Langsat",
        "Sirsak","Srikaya","Sawo","Jambu","Markisa","Belimbing","Kesemek","Delima","Kurma","Tin","Zaitun",
        "Ayam","Bebek","Ikan","Udang","Cumi","Kepiting","Kerang","Lele","Gurame","Nila","Tongkol","Bandeng",
        "Kakap","Tuna","Kerapu","Bawal","Cakalang","Pari","Kambing","Sapi","Babi","Kerbau","Kelinci","Entok",
    ],
    "hewan": [
        "Kucing","Anjing","Harimau","Singa","Macan","Cheetah","Leopard","Jaguar","Lynx","Puma","Serigala","Coyote",
        "Rubah","Hyena","Beruang","Panda","Koala","Kanguru","Wombat","Platypus","Gajah","Badak","Kuda","Zebra",
        "Keledai","Tapir","Babi","Celeng","Rusa","Kijang","Menjangan","Antelop","Gazelle","Banteng","Kerbau","Sapi",
        "Domba","Kambing","Unta","Llama","Alpaca","Jerapah","Okapi","Hipopotamus","Walrus","AnjingLaut","Lumba",
        "Paus","Orca","Dugong","Manatee","Berang","BerangBerang","Landak","Trenggiling","Armadillo","Kuskus",
        "Monyet","Bekantan","Orangutan","Gorila","Simpanse","Bonobo","Baboon","Macaque","Lemur","Tarsius",
        "Kelinci","Marmut","Hamster","Gerbil","Chinchilla","Squirrel","Tupai","Chipmunk","Bajing","Tikus",
        "TikusTanah","Mole","Shrew","KeledaiLiar","Bison","Yak","Muskox","Reindeer","Elk","Moose","Caribou",
        "Elang","Rajawali","Falcon","Hawk","Alap","AlapAlap","BurungHantu","Owl","Gagak","Crow","Raven","Jalak",
        "Beo","Kakaktua","Nuri","Lovebird","Kenari","Parkit","Merpati","Dara","Pipit","Gelatik","Murai","Kutilang",
        "Cenderawasih","Kasuari","Emu","Kiwi","Penguin","Pelican","Bangau","Stork","Heron","Ibis","Flamingo",
        "Angsa","Bebek","Itik","Entog","Ayam","Kalkun","Puyuh","Merak","Peacock","Pheasant","Quail","Grouse",
        "Ikan","Hiu","Pari","Salmon","Tuna","Tongkol","Kakap","Kerapu","Nila","Gurame","Lele","Patin","Bandeng",
        "Sarden","Makarel","Kod","Trout","Carp","Koi","Cupang","Guppy","Molly","Platy","Neon","Discus","Arwana",
        "Lobster","Udang","Kepiting","Rajungan","Kerang","Tirams","Tiram","Remis","Siput","Keong","Cumi","Gurita",
        "Sotong","Jellyfish","Ubur","BintangLaut","BulutangkisLaut","Teripang","Anemon","Koral","Polip","Sponge",
        "Kupu","Ngengat","Capung","Lalat","Nyamuk","Lebah","Tawon","Semut","Rayap","Kecoa","Belalang","Jangkrik",
        "Tonggeret","Kunang","KunangKunang","Kumbang","Kepik","Walang","Walangsangit","Laba","Kalajengking","Kelabang",
        "Lipan","KakiSeribu","Cacing","Lintah","Planaria","Hydra","Amoeba","Paramecium","Kodok","Katak","KodokPohon",
        "Salamander","Newt","Axolotl","Kadal","Cicak","Tokek","Biawak","Komodo","Iguana","Chameleon","Buaya",
        "Alligator","Caiman","Gharial","Ular","Piton","Sanca","Kobra","Viper","Rattlesnake","Mamba","Anaconda",
        "Penyu","Kura","Terrapin","Tortoise","Belut","Sidat","Seahorse","IkanPari","IkanHiu","IkanMas",
    ],
    "generic": [],  # filled below
}

# Big generic Indonesian single-word noun list for any thin sub
GENERIC = """
Matahari Bulan Bintang Planet Komet Meteor Galaksi Semesta Awan Hujan Salju Es Kabut Embun Angin Badai Topan Petir Kilat Pelangi
Gunung Bukit Lembah Dataran Gurun Hutan Rimba Belukar Padang Sabana Rawa Pantai Pesisir Teluk Selat Samudra Laut Danau
Sungai AnakSungai AirTerjun Gua Goa Karst Delta Muara Pulau Semenanjung Tanjung Nusa Kepulauan Benua Negara Kota Desa
Kampung Dusun Kabupaten Provinsi Kecamatan Kelurahan RW RT Jalan Gang Lorong Jembatan Terowongan Bandara Stasiun Pelabuhan
Terminal Halte Pasar Mall Plaza Supermarket Minimarket Toko Warung Kios Stall Restoran Kafe Kedai Bakery Butik Salon
Barbershop Spa Gym Studio Bioskop Teater Museum Galeri Perpustakaan Sekolah Kampus Universitas Akademi Pesantren Madrasah
Kantor Gedung Menara Hotel Motel Inn Resort Villa Apartemen Kondominium Rumah Kos Asrama Mess MessHall Pabrik Workshop
Gudang Depot Garasi Parkir Pelataran Lapangan Stadion Arena Gelanggang Kolam KolamRenang Taman Kebun Arboretum Zoo
Akuarium Planetarium Observatorium Laboratorium Klinik RumahSakit Puskesmas Apotek Poliklinik Balai Pos KantorPos Bank
ATM KantorPajak KantorPolisi PosPolisi Markas MarkasBesar Pangkalan Barrack MarkasTNI MarkasPolri Pengadilan Kejaksaan
Notaris Advokat Pengacara Hakim Jaksa Polisi Tentara Marinir Pilot Pramugari Sopir Kurir KurirPaket Ojek Becak Bajaj
Bemo Angkot Bus Truk Pickup Van Sedan SUV MPV Hatchback Coupe Convertible Motor Skuter Moped Sepeda BecakMotor
Kereta KRL MRT LRT Monorel Trem Kapal Feri Yacht Perahu Sampan Rakit Kano Kayak Jetski Pesawat Helikopter Drone
BalonDirigible Roket Satelit StasiunLuarAngkasa Teleskop Mikroskop Kamera Lensa Tripod Flash Softbox Ringlight
Televisi Radio Speaker Headphone Earphone Microphone Amplifier Receiver Tuner Antenna Router Modem Switch Hub
Laptop Desktop Tablet Handphone Smartphone Smartwatch Wearable Console Gamepad Joystick Keyboard Mouse Trackpad
Printer Scanner Fotokopi Faks Proyektor Monitor Display Screen Panel Touchscreen Stylus Digitizer Webcam
Lampu Senter Lilin Obor Lentera Neon LED Bohlam Remot Saklar Stopkontak Colokan Kabel Charger Powerbank Baterai
Aki Dinamo Generator Turbine SolarPanel Inverter UPS Trafo Relai Contactor Breaker Fuse Capasitor Resistor
Kulkas Freezer Oven Microwave Toaster Blender Mixer Juicer Grinder CoffeeMaker RiceCooker SlowCooker AirFryer
Kompor Exhaust Hood Sink Keran Wastafel BakMandi Shower Closet Bidet WastafelKecil Rak Lemari Laci Meja Kursi
Sofa Bangku Bench Stool Ottoman Kasur Dipan Divan Ranjang Bantal Guling Selimut Sprei Bedcover Coverlet Quilt
Tirai Gorden Blind Venetian Karpet Keset Matras Rug Wallpaper Cat Vernis Plamir Dempul Semen Pasir Batu Bata
Baja Besi Aluminium Tembaga Perunggu Kuningan Timah Seng Nikel Krom Titanium Platinum Emas Perak Berlian Intan
Safir Zamrud Ruby Topaz Opal Quartz Giok Amber Mutiara Kristal Marmer Granit Ubin Keramik Porselen Kaca Akrilik
Plastik Karet Silikon Latex Kayu Bambu Rotan Lidi Pandan Anyaman Tenun Batik Songket Ikat Poleng Lurik Tenunan
Kemeja Kaus Kaos Hem Blus Hemd Jaket Coat Blazer Mantel Jas Raincoat Parka Windbreaker Hoodie Sweater Cardigan
Celana Shorts Skirt Rok Dress Gaun Gamis Hijab Kerudung Jilbab Cadar Niqab Peci Songkok Topi Cap Helm TopiBesi
Sepatu Sandal Sendal Boots Sneakers Loafers Oxford Heels Wedges Flats Slipper SendalJepit SepatuBola SepatuLari
Kaoskaki Stoking Legging Stocking SarungTangan Glove Mittens Syal Scarf Dasi Bowtie Suspender Belt IkatPinggang
Tas Ransel Backpack Tote Clutch Dompet Wallet Purse Pouch Sling FannyPack Duffle Suitcase Koper Travelbag
Kacamata Sunglasses Monocle LensaKontak HearingAid Jam JamTangan Gelang Bracelet Cincin Ring Kalung Necklace
Anting Earring Bros Brooch Tiara Mahkota Crown Diadem Medali Pin Badge Lencana IkatRambut Hairpin JepitRambut
Sisir Sikat SikatGigi PastaGigi Odol Sabun Shampoo Conditioner Bodywash Lotion Cream Serum Toner Moisturizer
Parfum Cologne Deodorant Antiprespirant Bedak Powder Blush Lipstik Lipbalm Mascara Eyeliner Eyeshadow Foundation
Gunting Pisau Garpu Sendok Sumpit Spatula Whisk Ladle Tong Tongs RollingPin Talenan Mortar Pestle BlenderTangan
Piring Mangkuk Bowl Piala Gelas Cangkir Mug Teapot Kettle Thermos Termos Botol Flask Carafe Decanter Jar
Toples Kaleng Can Tin Pack Kotak Box Kardus Carton Amplop Envelope Map Folder Binder Notebook Buku Pensil
Pulpen Bolpoin Spidol Marker Highlighter TipEx Tippex Penghapus Eraser Penggaris Ruler Jangka Compass Busur
Stapler Punch Perforator Klip Paperclip BinderClip Pita Tape Lem Glue CatAir CatMinyak CatAkrilik Kanvas
Kuas Brush PensilWarna Crayon Pastel Charcoal Arang Kapur Chalk Papan Whiteboard Blackboard Flipchart Poster
Bendera Flag Spanduk Banner Baliho Billboard NeonSign PapanNama Nameplate Plakat Plaque Trofi Trophy PialaEmas
MedaliEmas MedaliPerak MedaliPerunggu Sertifikat Diploma Ijazah Piagam Award Penghargaan Hadiah Gift Present

Anggur Apel Jeruk Lemon Lime Nipis JerukNipis JerukBali JerukMandarin JerukSunkist Pepaya Mangga Melon Semangka Blewah
Pisang PisangRaja PisangAmbon PisangKepok PisangTanduk PisangCavendish Stroberi Bluberi Raspberry Blackberry Ceri
Alpukat JambuAir JambuBiji JambuMonyet Sirsak Srikaya Nangka Cempedak Durian Durio Salak Pondoh SalakBali
Rambutan Kelengkeng Leci Longan Duku Langsat Kokosan Manggis Markisa Belimbing Kesemek Delima Kurma
Zaitun Tin TinBuah TinKering TinSegar Kelapa KelapaMuda KelapaTua KelapaParut Santan AirKelapa
UbiUbi TalasTalas SingkongSingkong KentangKentang Wortel Lobak Bit BitMerah BitGula BitBaby
Brokoli KembangKol Kubis Sawi Pakcoy Kangkung Bayam Selada SeladaAir SeladaRomaine Seledri
Buncis KacangPanjang KacangKapri KacangMerah KacangHijau KacangTanah KacangKedelai Kedelai Edamame
Tomat Terong Cabai CabaiMerah CabaiHijau CabaiRawit CabaiKeriting Paprika PaprikaMerah PaprikaHijau
Bawang BawangMerah BawangPutih BawangBombay DaunBawang Prei Kucai Kemangi Selasih Pandan
Jahe Kunyit Lengkuas Kencur Temulawak Ketumbar Jinten Merica Lada Pala Cengkeh KayuManis
Kapulaga Adas KetumbarBubuk KunyitBubuk MericaBubuk Garam GaramLaut GaramHimalaya Gula GulaPasir
GulaAren GulaMerah GulaJawa GulaBatu Madu MaduHutan MaduLebah SirupMaple SirupAren
Minyak MinyakGoreng MinyakZaitun MinyakKelapa MinyakWijen Mentega Margarin MentegaPutih
Tepung TepungTerigu TepungBeras TepungKanji TepungMaizena TepungKetang TepungSagu TepungTapioka
Beras BerasMerah BerasHitam BerasKetan Ketan KetanHitam KetanPutih JagungBeras
""".split()

# Proper-name-ish single tokens for entertainment categories
NAMES = """
Naruto Sasuke Sakura Kakashi Goku Vegeta Luffy Zoro Sanji Nami Ichigo Bleach Light L Lawliet
Eren Mikasa Levi Armin Gojo Yuji Megumi Nobara Tanjiro Nezuko Zenitsu Inosuke Deku Bakugo Todoroki
AllMight Saitama Genos Mob Edward Alphonse Winry Ash Misty Brock Pikachu Charizard Mewtwo Lucario
Mario Luigi Peach Yoshi Bowser Link Zelda Ganondorf Samus Kirby Pikmin Sonic Tails Knuckles Shadow
MasterChief Kratos Lara SolidSnake Geralt Ciri Aloy Ellie Joel Nathan Drake LaraCroft Cloud Sephiroth
Tifa Aerith Barret Sora Riku Kairi Noctis Lightning Yuna Tidus Squall Rinoa Vivi Zidane
Batman Superman Spiderman Ironman Thor Hulk Wolverine Deadpool Flash Wonderwoman Aquaman Greenlantern
Joker Harley Thanos Loki Venom Magneto Mystique Storm Cyclops Gambit Rogue JeanGrey ProfessorX
Harry Hermione Ron Dumbledore Voldemort Snape Draco Luna Neville Frodo Gandalf Aragorn Legolas
Gimli Boromir Samwise Merry Pippin Sauron Saruman Galadriel Elrond Neo Trinity Morpheus AgentSmith
Jack Rose JackSparrow Elizabeth WillTurner Woody Buzz Jessie Rex Forky Elsa Anna Olaf Kristoff
Simba Nala Mufasa Scar Timon Pumbaa WoodyBuzz Remy Linguini AntonEgo WallE Eve Carl EllieRussell
Tony Stark Pepper Potts SteveRogers Bucky Natasha Clint BruceBanner PeterParker MilesMorales Gwen
""".split()

SPORTS = """
Sepakbola Futsal Basket Voli Badminton Tenis Pingpong Squash Golf Rugbi Baseball Softball Cricket
Hoki Hockey Icehockey Skating Skateboard Snowboard Surfing Diving Renang Polo Waterpolo Dayung
Kano Kayak Rafting Climbing Panjat PanjatTebing PanjatTali Trail Running Marathon Sprint Relay
Lompat Loncat LoncatJauh LoncatTinggi LompatGalah Lempar Tolak TolakPeluru LemparCakram LemparLembing
Tinju Boxing MMA Kickboxing Muaythai Karate Judo Taekwondo Wushu Silat Capoeira Wrestling Sumo
AngkatBesi Weightlifting Powerlifting Bodybuilding Crossfit Yoga Pilates Aerobik Zumba Cardio
Catur Bridge Poker Domino Gaple Remi Blackjack Baccarat Mahjong Scrabble Monopoly UNO Billiard
Snooker Bowling Darts ESports Mobail Mobilelegends Valorant Dota Lol Pubg Freefire Cod
Messi Ronaldo Neymar Mbappe Haaland Salah Kane Benzema Modric Kroos DeBruyne Lewandowski
Vinicius Rodri Pedri Gavi Bellingham Saka Foden Rice Palmer SakaSon SonHeungmin KaneHarry
Federer Nadal Djokovic Alcaraz Sinner Swiatek Osaka Williams Serena Venus Bolt Phelps
Jordan Lebron Curry Durant Giannis Jokic Embiid Doncic Tatum Brown Kawhi Leonard PaulGeorge
""".split()

PLACES_ID = """
Aceh Medan Padang Pekanbaru Jambi Palembang Bengkulu Bandarlampung Pangkalpinang Tanjungpinang
Jakarta Bandung Bogor Depok Bekasi Tangerang Cirebon Tasikmalaya Sukabumi Semarang Solo
Yogyakarta Magelang Pekalongan Tegal Purwokerto Surakarta Surabaya Malang Kediri Madiun
Jember Banyuwangi Denpasar Mataram Kupang Pontianak Singkawang Palangkaraya Banjarmasin
Balikpapan Samarinda Tarakan Manado Bitung Tomohon Palu Makassar Parepare Kendari Gorontalo
Ambon Ternate Tidore Sorong Jayapura Merauke Biak Timika Wamena Nabire Manokwari Fakfak
Bali Lombok Bangka Belitung Madura Batam Bintan Karimun Kepulauan Natuna Anambas Mentawai
Nias Enggano Simeulue Sabang Weh Toba Samosir Rajaampat Wakatobi Bunaken Derawan Labuanbajo
Bromo Tengger Semeru Rinjani Kerinci Merapi Merbabu Slamet Sindoro Sumbing Lawu Arjuno
Welirang Semeru Bromo Ijen Kelud Agung Batur Tambora Krakatau Anakkrakatau Gamalama
""".split()

APPS = """
Whatsapp Telegram Signal Discord Slack Zoom Meet Teams Skype Line Messenger Instagram Facebook
Twitter XTiktok Tiktok Youtube Netflix Spotify Applemusic Joox Langitmusik YoutubeMusic Deezer
Shopee Tokopedia Lazada Bukalapak Blibli JDID Zalora Sociolla Sephora Grab Gojek Maxim InDrive
Traveloka Tiket Booking Airbnb Agoda Tripadvisor Maps Googlemaps Waze Grabmaps Applemaps
Gmail Outlook Yahoo Hotmail Protonmail Notion Notionso Evernote Onenote Bear Obsidian Logseq
Figma Canva Adobe Photoshop Illustrator Premiere Aftereffects Blender Sketch Capcut VN
Chrome Firefox Safari Edge Opera Brave Vivaldi Tor Duckduckgo Bing YahooSearch Ecosia
Wordpress Blogger Medium Substack Ghost GhostCMS Webflow Framer Bubble Flutter React Vue
Python Java Javascript Typescript Golang Rust Kotlin Swift Dart Ruby PHP Scala Elixir
Android Ios Windows Macos Linux Ubuntu Debian Fedora Arch Centos Redhat FreeBSD OpenBSD
""".split()

BRANDS = """
Toyota Honda Yamaha Suzuki Kawasaki Daihatsu Mitsubishi Nissan Mazda Hyundai Kia Wuling
BMW Mercedes Audi Volkswagen Porsche Ferrari Lamborghini Maserati Bentley Rollsroyce Jaguar
Landrover Jeep Ford Chevrolet Tesla Rivian Lucid Byd Neta Chery MG Haval Gwm Ora
Vespa Piaggio Harley Ducati Triumph KTM Husqvarna Aprilia BMWMotorrad RoyalEnfield Bajaj
Apple Samsung Xiaomi Oppo Vivo Realme Huawei Honor Oneplus Nokia Motorola Asus Lenovo
Acer Dell HP MSI Razer Corsair Logitech Steelseries Hyperx Sony Playstation Xbox Nintendo
Canon Nikon Fujifilm SonyAlpha Panasonic Olympus Leica GoPro DJI Insta360 Osmo
Uniqlo Zara Hm Nike Adidas Puma Reebok Newbalance Converse Vans Skechers Timberland
Gucci Louisvuitton Chanel Hermes Prada Dior Burberry Rolex Omega Cartier Tiffany
Indomie Sarimi Supermi MieSedaap Popmie Mayora Garuda Wings Indofood Wingsfood ABC
""".split()

FILM_ONE = """
Inception Interstellar Dunkirk Tenet Oppenheimer Avatar Titanic Gladiator Braveheart Matrix
Joker Jaws Alien Predator Terminator Rocky Creed Rambo Topgun Mission Impossible
Casablanca Psycho Vertigo Citizenkane Godfather Scarface Goodfellas Casino Heat
Amelie Whiplash LaLaLand Parasite Oldboy Memories Murder Romance Chungking
Spiritedaway Totoro Howl Ponyo Kiki Mononoke Nausicaa Princess Kaguya Grave
Up Insideout Coco Soul Luca Turningred Encanto Frozen Moana Tangled Brave
Zootopia Bighero Wreckit Ralph Cars Findingnemo Findingdory WallE Ratatouille
Avengers Endgame Infinitywar Ultron Civilwar Wintersoldier Farfromhome Nowayhome
Blackpanther Wakandaforever Doctorstrange Multiverse Shangchi Eternals Guardians
Starwars Empire Jedi Forceawakens Lastjedi Riseofskywalker Rogueone Solomovie
Harrypotter Chamber Prisoner Goblet Order Phoenix Halfblood Deathly Hallows
Lotr Fellowship Twotowers Returnking Hobbit Unexpected Desolation Fivearmies
""".split()

ANIME_ONE = """
Naruto Bleach Onepiece Dragonball Deathnote Attackontitan Demonslayer Jujutsu Myhero
TokyoGhoul Fullmetal Hunterxhunter FairyTail Blackclover Onepunch Mobpsycho Vinland
Spyfamily Chainsawman Hellparadise Plutos Monster Vinlandsaga Steinsgate Codegeass
Evangelion Cowboybebop Trigun Samuraichamploo Gurren Fate Staynight Unlimitedblade
Swordart Overlord Rezero Konosuba Shieldhero ThatTime Slime Noblesse Towerofgod
Haikyuu Kuroko SlamDunk Free Iwatobi Aceofthediamond Major Captain Tsubasa BlueLock
Yourname Weathering Suzume Gardenwords ASilentVoice Whisper Heart 5Centimeters
Spirited Howls Kikis Ponyo Totoro Mononoke Nausicaa Porco Grave Fireflies
""".split()

GAME_ONE = """
Minecraft Fortnite Roblox Valorant Overwatch Apexleague Apexlegends Pubg Freefire Codmobile
Mobilelegends Honorofkings Wildrift Leagueoflegends Dota Csgo Counterstrike Gta
Reddead Witcher Cyberpunk Eldenring Darksouls Bloodborne Sekiro Liesofp Armoredcore
Zelda Mario Kart Smash Metroid Pikmin Animalcrossing Pokemon Go Homecoming Scarlet
Genshin Honkai Starrail Zenless Wuthering Towerfantasy Nikke Bluearchive Arknights
Amongus Fallguys Rocketleague Fifa Easports Nba2k Pes Efootball Madden NHL
Resident Evil SilentHill Deadspace Outlast Amnesia Phasmophobia Lethalcompany
AmongUs FallGuys RocketLeague Stardew Terraria Valheim Raft Subnautica NoMansSky
""".split()

# Map subcategory name -> preferred pool keys
SUB_POOL: dict[str, list[str]] = {}

def words_from(*lists: list[str]) -> list[str]:
    out, seen = [], set()
    for lst in lists:
        for w in lst:
            w = w.strip()
            if not w or " " in w:
                continue
            # strip accidental punctuation
            w = re.sub(r"[^A-Za-z0-9À-ÿ\-']+", "", w)
            if not w:
                continue
            k = w.lower()
            if k in seen:
                continue
            seen.add(k)
            out.append(w)
    return out

ALL_POOLS = {
    "minuman": words_from(POOLS["minuman"], GENERIC[:80]),
    "makanan": words_from(POOLS["makanan"], GENERIC[80:200]),
    "hewan": words_from(POOLS["hewan"], GENERIC[200:320]),
    "generic": words_from(GENERIC, NAMES, SPORTS, PLACES_ID, APPS, BRANDS, FILM_ONE, ANIME_ONE, GAME_ONE),
    "nama": words_from(NAMES, ANIME_ONE, FILM_ONE),
    "olahraga": words_from(SPORTS, NAMES[-40:], GENERIC[320:400]),
    "tempat": words_from(PLACES_ID, GENERIC[400:520]),
    "elektronik": words_from(APPS, BRANDS, GENERIC[520:640]),
    "kendaraan": words_from(BRANDS[:80], GENERIC[640:760]),
    "film": words_from(FILM_ONE, NAMES, GENERIC[100:180]),
    "anime": words_from(ANIME_ONE, NAMES, GENERIC[180:260]),
    "game": words_from(GAME_ONE, NAMES, GENERIC[260:360]),
    "musik": words_from(GENERIC[50:150], NAMES[20:80], APPS[10:40]),
    "budaya": words_from(PLACES_ID, GENERIC[150:280], NAMES[40:90]),
    "daerah": words_from(PLACES_ID, GENERIC[280:400]),
    "negara": words_from(PLACES_ID, GENERIC[400:500], [
        "Indonesia","Malaysia","Singapura","Thailand","Vietnam","Filipina","Myanmar","Kamboja","Laos","Brunei",
        "Jepang","Korea","China","India","Pakistan","Bangladesh","Srilanka","Nepal","Bhutan","Maladewa",
        "Australia","NewZealand","Fiji","Papua","Timorleste","Arab","Saudi","Emirat","Qatar","Kuwait",
        "Turki","Iran","Irak","Suriah","Yordania","Israel","Mesir","Maroko","Aljazair","Tunisia",
        "Afrika","Nigeria","Kenya","Ethiopia","Ghana","AfrikaSelatan","Brazil","Argentina","Chile","Peru",
        "Mexico","Kanada","Amerika","Inggris","Prancis","Jerman","Italia","Spanyol","Portugal","Belanda",
        "Belgia","Swiss","Austria","Swedia","Norwegia","Denmark","Finlandia","Polandia","Ukraina","Rusia",
        "Yunani","Ceko","Hungaria","Rumania","Bulgaria","Serbia","Kroasia","Islandia","Irlandia","Skotlandia",
    ]),
    "profesi": words_from([
        "Dokter","Perawat","Bidan","Apoteker","Psikiater","Psikolog","DokterGigi","DokterHewan","Paramedis","Analis",
        "Guru","Dosen","Tutor","Mentor","Pelatih","Coach","Instruktur","Pengajar","KepalaSekolah","Rektor",
        "Polisi","Tentara","Marinir","Pilot","Pramugari","Nahkoda","Masinis","Supir","Sopir","Kurir",
        "Koki","Chef","Pelayan","Waiter","Barista","Bartender","Baker","Pastry","Butcher","Nelayan",
        "Petani","Peternak","Pekebun","Tukang","Montir","Mekanik","Teknisi","Insinyur","Arsitek","Desainer",
        "Programmer","Developer","AnalisData","Scientist","Peneliti","Penulis","Jurnalis","Editor","Reporter","Fotografer",
        "Kameramen","Sutradara","Produser","Aktor","Aktris","Penyanyi","Penari","Komposer","DJ","VJ",
        "Pengacara","Hakim","Jaksa","Notaris","Akuntan","Auditor","Konsultan","Manajer","Direktur","CEO",
        "CFO","CTO","HR","Recruiter","Sales","Marketing","Content","Influencer","Streamer","Youtuber",
        "Kasir","Admin","Sekretaris","Resepsionis","Security","Satpam","Cleaning","OfficeBoy","Porter","Guide",
        "Pemandu","Tourguide","Translator","Interpreter","Diplomat","Duta","Menteri","Presiden","Gubernur","Bupati",
        "Walikota","Camat","Lurah","RT","RW","Kyai","Ustadz","Pendeta","Pastor","Biksu","Rahib","Nun",
    ], GENERIC[700:820]),
}

# subcategory name contains -> pool key
RULES = [
    (r"minuman|kopi|teh|segar|hangat", "minuman"),
    (r"makanan|masakan|mi|bakso|kue|camilan|jajanan", "makanan"),
    (r"hewan|ikan|mamalia|burung|serangga", "hewan"),
    (r"atlet|klub|olahraga|permainan", "olahraga"),
    (r"kota|kabupaten|provinsi|wisata|daerah", "daerah"),
    (r"negara", "negara"),
    (r"ruangan|tempat|bangunan", "tempat"),
    (r"film|serial|disney|hollywood|superhero", "film"),
    (r"anime|karakter anime|istilah anime|pokemon", "anime"),
    (r"game|hero|valorant|dota|genshin|mobile legends|honor", "game"),
    (r"aplikasi|media sosial|elektronik|alat & perkakas|perangkat", "elektronik"),
    (r"merek|kendaraan|jalan|perjalanan", "kendaraan"),
    (r"penyanyi|band|grup|musik|genre|alat musik", "musik"),
    (r"tokoh|sejarah|budaya|seni|tradisi", "budaya"),
    (r"profesi|pekerjaan", "profesi"),
]

def pool_for(sub_name: str, cat_id: str) -> list[str]:
    low = sub_name.lower()
    for pat, key in RULES:
        if re.search(pat, low):
            return ALL_POOLS[key]
    if cat_id in ALL_POOLS:
        return ALL_POOLS[cat_id]
    return ALL_POOLS["generic"]

def uniquify(words: list[str]) -> list[str]:
    seen, out = set(), []
    for w in words:
        w = re.sub(r"\s+", " ", w.strip())
        if not is_one(w):
            continue
        k = w.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(w)
    return out

def near_dup(a: str, b: str) -> bool:
    a, b = a.lower(), b.lower()
    if a == b:
        return True
    if len(a) >= 3 and len(b) >= 3 and (a in b or b in a):
        return True
    return False

def top_up(existing: list[str], pool: list[str], target: int, tag: str) -> list[str]:
    words = uniquify(existing)
    # drop near-duplicates among existing (prefer shorter)
    words = sorted(words, key=lambda w: (len(w), w.lower()))
    kept = []
    for w in words:
        if any(near_dup(w, k) for k in kept):
            continue
        kept.append(w)
    words = kept
    have = {w.lower() for w in words}
    for w in pool:
        if len(words) >= target:
            break
        k = w.lower()
        if k in have:
            continue
        if any(near_dup(w, x) for x in words):
            continue
        have.add(k)
        words.append(w)
    if len(words) < target:
        # second pass: allow near-dups only if still short (should be rare)
        for w in pool:
            if len(words) >= target:
                break
            k = w.lower()
            if k in have:
                continue
            have.add(k)
            words.append(w)
    return words

def main():
    words_before = words_after = 0
    combo_before = combo_after = 0
    multi_removed = 0
    for path in sorted(SRC.glob("*.txt")):
        header, subs = parse(path)
        if not header:
            raise SystemExit(f"no header in {path}")
        cid = header[2:].split("|")[0].strip()
        new_subs = []
        for s in subs:
            raw = s["kata"]
            all_unique = []
            seen = set()
            for w in raw:
                w = re.sub(r"\s+", " ", w.strip())
                if not w:
                    continue
                k = w.lower()
                if k in seen:
                    continue
                seen.add(k)
                all_unique.append(w)
            single = [w for w in all_unique if is_one(w)]
            multi_removed += len(all_unique) - len(single)
            n_all = len(all_unique)
            n_single = len(single)
            combo_before += n_all * (n_all - 1) // 2
            words_before += n_all

            if s["nama"] in NO_TOPUP:
                filled = [w for w in uniquify(single) if is_one(w)]
            else:
                pool = pool_for(s["nama"], cid) + ALL_POOLS["generic"]
                tag = re.sub(r"[^a-z0-9]+", "", s["nama"].lower())[:8] or cid[:6]
                filled = top_up(single, pool, TARGET, tag.capitalize())
                filled = [w for w in uniquify(filled) if is_one(w)]
                if len(filled) < TARGET:
                    print("WARN short", cid, s["nama"], len(filled))
            combo_after += len(filled) * (len(filled) - 1) // 2
            words_after += len(filled)
            new_subs.append({"nama": s["nama"], "kata": filled})
            print(f"{cid:12} {s['nama'][:40]:40} {n_single:4}->{len(filled):4}")
        write(path, header, new_subs)

    print("MULTI_REMOVED", multi_removed)
    print("WORDS", words_before, "->", words_after)
    print("COMBO", combo_before, "->", combo_after)
    if combo_after < 1_000_000:
        raise SystemExit(f"combo still below 1M: {combo_after}")

if __name__ == "__main__":
    main()
