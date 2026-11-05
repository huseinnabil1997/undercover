// RPC antrean matchmaking (lihat migrasi antrean_match).
import { rapikanStatus, type StatusAntrean } from '../online/antrean';
import { KUNCI_SUPABASE, URL_SUPABASE } from './konfig';
import { supabase } from './klien';

async function rpc(nama: string, arg: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await supabase().rpc(nama, arg);
  if (error) throw error;
  return data;
}

export const masukAntrean = async (ukuran: number | null): Promise<StatusAntrean | null> =>
  rapikanStatus(await rpc('masuk_antrean', { p_ukuran: ukuran }));
export const detakAntrean = async (): Promise<StatusAntrean | null> => rapikanStatus(await rpc('detak_antrean'));
export const keluarAntrean = async (): Promise<void> => {
  await rpc('keluar_antrean');
};

/** Saat halaman ditutup: kirim keluar_antrean dengan keepalive (supabase-js tidak bisa). Sisanya dibersihkan detak basi 30 detik. */
export async function keluarAntreanSaatTutup(): Promise<void> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    void fetch(`${URL_SUPABASE}/rest/v1/rpc/keluar_antrean`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: KUNCI_SUPABASE, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    // dibersihkan oleh batas detak di server
  }
}

/** Notifikasi instan saat baris antrean milik sendiri berubah (RLS: hanya baris sendiri). Detak tetap jadi cadangan. */
export function pantauAntrean(uid: string, onUbah: () => void): () => void {
  const sb = supabase();
  const ch = sb
    .channel(`antrean:${uid}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'antrean_match', filter: `user_id=eq.${uid}` }, () => onUbah())
    .subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}
