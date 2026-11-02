// Kunci PUBLIK (publishable, pk_live_) Metered Realtime Messaging untuk jalur relay. Kunci jenis ini memang
// dirancang untuk ditanam di kode frontend: izinnya hanya Subscribe, Publish, dan Presence (Send mati), dan kuota
// paket gratis dibatasi keras tanpa tagihan tambahan. Bisa diganti saat build lewat NEXT_PUBLIC_METERED_KEY
// (string kosong = Metered tidak dipakai, relay hanya lewat MQTT).
export const KUNCI_METERED: string = process.env.NEXT_PUBLIC_METERED_KEY ?? 'pk_live_0b994a037a04c2702c937919885aff3b21999463';
