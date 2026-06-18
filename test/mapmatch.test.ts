import { describe, expect, it } from 'vitest';
import { __test } from '../src/integrations/mapmatch/valhalla';

// Codificador polyline precisão 6 (algoritmo padrão) só para o teste de ida-e-volta.
function encodePolyline6(coords: [number, number][]): string {
  let last = [0, 0];
  let out = '';
  const enc = (v: number) => {
    let value = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (value >= 0x20) {
      s += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    s += String.fromCharCode(value + 63);
    return s;
  };
  for (const [lng, lat] of coords) {
    const ilat = Math.round(lat * 1e6);
    const ilng = Math.round(lng * 1e6);
    out += enc(ilat - last[0]!);
    out += enc(ilng - last[1]!);
    last = [ilat, ilng];
  }
  return out;
}

describe('mapmatch — decodePolyline6', () => {
  it('decodifica de volta as coordenadas codificadas (precisão 6)', () => {
    const original: [number, number][] = [
      [-46.6566, -23.5614],
      [-46.658, -23.5602],
      [-46.6601, -23.5588],
      [-46.701, -23.529],
    ];
    const encoded = encodePolyline6(original);
    const decoded = __test.decodePolyline6(encoded);

    expect(decoded).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decoded[i]![0]).toBeCloseTo(original[i]![0]!, 5);
      expect(decoded[i]![1]).toBeCloseTo(original[i]![1]!, 5);
    }
  });

  it('string vazia → lista vazia', () => {
    expect(__test.decodePolyline6('')).toEqual([]);
  });
});
