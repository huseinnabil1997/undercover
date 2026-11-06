// Kehadiran room independen dari host: Supabase Realtime presence + detak DB.
// Presence di kanal privat "uch:<hex>"; heartbeat last_seen di anggota_room.terlihat (~20 dtk, offline ~45 dtk).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase/klien';

export const DETAK_KEHADIRAN_MS = 20_000;
export const BATAS_KEHADIRAN_MS = 45_000;

export type StatusHadir = 'online' | 'menyambung' | 'offline';

/** Peta id pemain room -> status tampilan. */
export type PetaHadir = Map<string, StatusHadir>;

function isiPresence(state: Record<string, unknown> | undefined): Set<string> {
  const out = new Set<string>();
  if (!state) return out;
  for (const meta of Object.values(state)) {
    const baris = Array.isArray(meta) ? meta : [meta];
    for (const m of baris) {
      const id = (m as { id?: unknown } | null)?.id;
      if (typeof id === 'string' && id) out.add(id);
    }
  }
  return out;
}

/** Gabungkan presence + detak DB (username) + status host lama sampai sync pertama. */
export function gabungKehadiran(opsi: {
  ids: readonly string[];
  /** username lowercase -> id pemain room */
  namaKeId: Map<string, string>;
  presence: Set<string> | null;
  heartbeatOnline: ReadonlySet<string>;
  hostOnline: ReadonlyMap<string, boolean>;
  sudahSync: boolean;
}): PetaHadir {
  const m: PetaHadir = new Map();
  for (const id of opsi.ids) {
    if (opsi.presence?.has(id)) {
      m.set(id, 'online');
      continue;
    }
    if (!opsi.sudahSync) {
      // Belum sync presence: jangan flash offline; tampilkan terakhir diketahui / menyambung.
      const lama = opsi.hostOnline.get(id);
      m.set(id, lama === false ? 'menyambung' : 'online');
      continue;
    }
    m.set(id, 'offline');
  }
  if (opsi.heartbeatOnline.size) {
    for (const [nama, id] of opsi.namaKeId) {
      if (opsi.heartbeatOnline.has(nama) && m.get(id) !== 'online') m.set(id, 'online');
    }
  }
  return m;
}

export function onlineDariHadir(hadir: StatusHadir | undefined, fallbackHost: boolean): boolean {
  if (hadir === 'online' || hadir === 'menyambung') return true;
  if (hadir === 'offline') return false;
  return fallbackHost;
}

/**
 * Ikut presence room + detak DB. `hex` kosong = room tanpa Supabase (kembalikan null → pakai host.online).
 */
export function useKehadiranRoom(
  hex: string | null | undefined,
  sayaId: string | undefined,
  ids: readonly string[],
  namaKeId: Map<string, string>,
  hostOnline: ReadonlyMap<string, boolean>,
): PetaHadir | null {
  const [presence, setPresence] = useState<Set<string> | null>(null);
  const [sudahSync, setSudahSync] = useState(false);
  const [hb, setHb] = useState<Set<string>>(() => new Set());
  const kanalRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!hex || !sayaId) return;
    let hidup = true;
    const sb = supabase();

    const muatHb = async () => {
      try {
        await sb.rpc('detak_anggota', { p_topik: hex });
        const { data } = await sb.rpc('daftar_kehadiran', { p_topik: hex });
        if (!hidup) return;
        const s = new Set<string>();
        for (const r of (data as { username?: string; online?: boolean }[] | null) ?? []) {
          if (r.online && typeof r.username === 'string') s.add(r.username.toLowerCase());
        }
        setHb(s);
      } catch {
        /* presence tetap utama */
      }
    };

    void (async () => {
      try { await sb.realtime.setAuth(); } catch { /* */ }
      if (!hidup) return;
      const kanal = sb.channel(`uch:${hex}`, { config: { private: true, presence: { key: sayaId } } });
      kanalRef.current = kanal;
      const terapkan = () => {
        if (!hidup) return;
        setPresence(isiPresence(kanal.presenceState() as Record<string, unknown>));
        setSudahSync(true);
      };
      kanal.on('presence', { event: 'sync' }, terapkan);
      kanal.on('presence', { event: 'join' }, terapkan);
      kanal.on('presence', { event: 'leave' }, terapkan);
      kanal.subscribe(async (s) => {
        if (!hidup || s !== 'SUBSCRIBED') return;
        try { await kanal.track({ id: sayaId, at: Date.now() }); } catch { /* */ }
        terapkan();
      });
    })();

    void muatHb();
    const timer = window.setInterval(() => void muatHb(), DETAK_KEHADIRAN_MS);
    return () => {
      hidup = false;
      window.clearInterval(timer);
      const k = kanalRef.current;
      kanalRef.current = null;
      if (k) {
        void k.untrack().catch(() => {});
        void sb.removeChannel(k);
      }
    };
  }, [hex, sayaId]);

  return useMemo(() => {
    if (!hex || !sayaId) return null;
    return gabungKehadiran({
      ids, namaKeId, presence, heartbeatOnline: hb, hostOnline, sudahSync,
    });
  }, [hex, sayaId, ids, namaKeId, presence, hb, hostOnline, sudahSync]);
}
