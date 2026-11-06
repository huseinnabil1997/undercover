import { describe, expect, it } from 'vitest';
import {
  MAKS_ISI_BALASAN,
  MAKS_ISI_MASUKAN,
  pesanMasukan,
  terapkanToggleVote,
  urutBarisMasukan,
  validasiIsiBalasan,
  validasiIsiMasukan,
  type BarisMasukan,
} from '../lib/supabase/masukan';

function baris(p: Partial<BarisMasukan> & Pick<BarisMasukan, 'id'>): BarisMasukan {
  return {
    user_id: 'u',
    username: 'uji',
    isi: 'teks',
    kategori: 'lainnya',
    status: 'baru',
    dibuat: '2026-11-06T00:00:00Z',
    jumlah_vote: 0,
    saya_vote: false,
    jumlah_balasan: 0,
    ...p,
  };
}

describe('validasiIsiMasukan', () => {
  it('menolak kosong dan terlalu panjang', () => {
    expect(validasiIsiMasukan('   ')).toMatch(/Tulis/);
    expect(validasiIsiMasukan('ok')).toBeNull();
    expect(validasiIsiMasukan('x'.repeat(MAKS_ISI_MASUKAN + 1))).toMatch(/Maksimal/);
  });
});

describe('terapkanToggleVote', () => {
  it('naik dan turun tanpa negatif', () => {
    const a = baris({ id: 1, jumlah_vote: 2, saya_vote: false });
    const b = terapkanToggleVote(a, true);
    expect(b).toEqual({ ...a, saya_vote: true, jumlah_vote: 3 });
    const c = terapkanToggleVote(b, false);
    expect(c.jumlah_vote).toBe(2);
    expect(terapkanToggleVote(baris({ id: 2, jumlah_vote: 0, saya_vote: true }), false).jumlah_vote).toBe(0);
    expect(terapkanToggleVote(a, false)).toBe(a);
  });
});

describe('urutBarisMasukan', () => {
  it('urut vote lalu terbaru', () => {
    const d = [
      baris({ id: 1, jumlah_vote: 1, dibuat: '2026-11-05T00:00:00Z' }),
      baris({ id: 2, jumlah_vote: 5, dibuat: '2026-11-04T00:00:00Z' }),
      baris({ id: 3, jumlah_vote: 5, dibuat: '2026-11-06T00:00:00Z' }),
    ];
    expect(urutBarisMasukan(d, 'vote').map((x) => x.id)).toEqual([3, 2, 1]);
    expect(urutBarisMasukan(d, 'baru').map((x) => x.id)).toEqual([3, 1, 2]);
  });
});

describe('validasiIsiBalasan', () => {
  it('menolak kosong dan terlalu panjang', () => {
    expect(validasiIsiBalasan('   ')).toMatch(/Tulis/);
    expect(validasiIsiBalasan('ok')).toBeNull();
    expect(validasiIsiBalasan('x'.repeat(MAKS_ISI_BALASAN + 1))).toMatch(/Maksimal/);
  });
});

describe('pesanMasukan balasan', () => {
  it('membedakan batas balasan dan masukan', () => {
    expect(pesanMasukan({ code: 'P0001', message: 'batas 20 balasan per hari' })).toMatch(/20 balasan/);
    expect(pesanMasukan({ code: 'P0001', message: 'batas 5 masukan per hari' })).toMatch(/5 masukan/);
  });
});
