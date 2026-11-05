import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.fn();
vi.mock('../lib/supabase/klien', () => ({ supabase: () => ({ rpc }) }));
import { lepasKursiRoom } from '../lib/supabase/room';

describe('pemain keluar melepas kursi room', () => {
  beforeEach(() => rpc.mockReset());
  it('memanggil tinggalkan_room tanpa snapshot agar host tidak tertimpa', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await lepasKursiRoom('ab12');
    expect(rpc).toHaveBeenCalledWith('tinggalkan_room', { p_topik: 'ab12', p_snapshot: null });
  });
  it('galat server diteruskan agar pemanggil bisa mengabaikannya', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'x' } });
    await expect(lepasKursiRoom('ab12')).rejects.toMatchObject({ code: '42501' });
  });
});
