import { describe, expect, it } from 'vitest';
import { gabungKehadiran, onlineDariHadir } from '../lib/online/kehadiran';

describe('gabungKehadiran', () => {
  const namaKeId = new Map([['ani', 'a'], ['budi', 'b']]);
  const hostOnline = new Map([['a', true], ['b', true], ['c', false]]);

  it('sebelum sync: tidak flash offline', () => {
    const m = gabungKehadiran({
      ids: ['a', 'b', 'c'],
      namaKeId,
      presence: null,
      heartbeatOnline: new Set(),
      hostOnline,
      sudahSync: false,
    });
    expect(m.get('a')).toBe('online');
    expect(m.get('b')).toBe('online');
    expect(m.get('c')).toBe('menyambung');
  });

  it('presence dan heartbeat menandai online setelah sync', () => {
    const m = gabungKehadiran({
      ids: ['a', 'b', 'c'],
      namaKeId,
      presence: new Set(['a']),
      heartbeatOnline: new Set(['budi']),
      hostOnline,
      sudahSync: true,
    });
    expect(m.get('a')).toBe('online');
    expect(m.get('b')).toBe('online');
    expect(m.get('c')).toBe('offline');
  });

  it('onlineDariHadir', () => {
    expect(onlineDariHadir('menyambung', false)).toBe(true);
    expect(onlineDariHadir('offline', true)).toBe(false);
    expect(onlineDariHadir(undefined, true)).toBe(true);
  });
});
