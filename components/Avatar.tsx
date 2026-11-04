'use client';

// Avatar pemain: foto profil bila ada, selain itu inisial username dengan warna tetap.
import { useEffect, useState } from 'react';
import { inisial, urlAvatar, warnaAvatar } from '@/lib/avatar';
import { profilTercache } from '@/lib/supabase/data';

export function Avatar({ username, id, versi, ukuran = 32, cari = false }: {
  username: string;
  id?: string;
  versi?: number | null;
  ukuran?: number;
  /** Cari foto berdasarkan username bila id/versi tidak diketahui (mis. di room online). */
  cari?: boolean;
}) {
  const [ditemukan, setDitemukan] = useState<{ u: string; url: string | null } | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);
  useEffect(() => {
    if (!cari || id) return;
    let hidup = true;
    profilTercache(username).then((p) => {
      if (hidup) setDitemukan({ u: username, url: p ? urlAvatar(p.id, p.avatar_versi) : null });
    });
    return () => {
      hidup = false;
    };
  }, [cari, id, username]);
  const url = id ? urlAvatar(id, versi) : ditemukan?.u === username ? ditemukan.url : null;
  const gaya = { width: ukuran, height: ukuran, fontSize: Math.round(ukuran * 0.4) };
  if (url && gagal !== url) {
    // eslint-disable-next-line @next/next/no-img-element -- ekspor statis: next/image tidak mengoptimasi gambar
    return <img className="avatar" src={url} alt="" width={ukuran} height={ukuran} style={gaya} loading="lazy" decoding="async" onError={() => setGagal(url)} />;
  }
  return <span className="avatar" aria-hidden style={{ ...gaya, background: warnaAvatar(username) }}>{inisial(username)}</span>;
}
