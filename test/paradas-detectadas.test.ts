import { describe, expect, it } from 'vitest';
import { detectarParadas, haversineM } from '../src/modules/gps/paradas';

// Casos sintéticos: 0.001° de latitude ≈ 111 m.
const BASE = { lat: -23.56, lng: -46.65 };
const t0 = Date.parse('2026-07-01T12:00:00Z');
const min = (n: number) => t0 + n * 60_000;

function p(lat: number, lng: number, minuto: number) {
  return { lat, lng, time: min(minuto) };
}

describe('detectarParadas — clusters de parada (raio ~60 m, 5+ min)', () => {
  it('sem pontos → sem paradas', () => {
    expect(detectarParadas([])).toEqual([]);
  });

  it('veículo sempre em movimento → sem paradas', () => {
    // Pontos a cada minuto, ~222 m um do outro (fora do raio de 60 m).
    const pontos = Array.from({ length: 10 }, (_, i) => p(BASE.lat + i * 0.002, BASE.lng, i));
    expect(detectarParadas(pontos)).toEqual([]);
  });

  it('parado no mesmo lugar por 6 min → 1 parada com centro e duração certos', () => {
    const pontos = [
      p(BASE.lat - 0.01, BASE.lng, 0), // chegando (longe do cluster)
      p(BASE.lat, BASE.lng, 2),
      p(BASE.lat + 0.0002, BASE.lng, 4), // ~22 m de deriva (dentro do raio)
      p(BASE.lat, BASE.lng + 0.0002, 6),
      p(BASE.lat, BASE.lng, 8),
      p(BASE.lat + 0.02, BASE.lng, 9), // foi embora
    ];
    const paradas = detectarParadas(pontos);
    expect(paradas).toHaveLength(1);
    const parada = paradas[0]!;
    expect(parada.duracao_min).toBe(6);
    expect(parada.inicio).toBe('2026-07-01T12:02:00.000Z');
    expect(parada.fim).toBe('2026-07-01T12:08:00.000Z');
    // Centro é a média do cluster → a menos de 30 m do ponto base.
    expect(haversineM(parada, BASE)).toBeLessThan(30);
  });

  it('parado por menos de 5 min → não vira parada', () => {
    const pontos = [
      p(BASE.lat, BASE.lng, 0),
      p(BASE.lat, BASE.lng, 2),
      p(BASE.lat, BASE.lng, 4), // 4 min parado (< 5)
      p(BASE.lat + 0.02, BASE.lng, 5),
    ];
    expect(detectarParadas(pontos)).toEqual([]);
  });

  it('duas paradas separadas por movimento → detecta as duas', () => {
    const pontos = [
      p(BASE.lat, BASE.lng, 0),
      p(BASE.lat, BASE.lng, 5), // parada 1: 5 min
      p(BASE.lat + 0.01, BASE.lng, 7), // em movimento
      p(BASE.lat + 0.02, BASE.lng, 9),
      p(BASE.lat + 0.02, BASE.lng, 16), // parada 2: 7 min
      p(BASE.lat + 0.04, BASE.lng, 18),
    ];
    const paradas = detectarParadas(pontos);
    expect(paradas).toHaveLength(2);
    expect(paradas[0]!.duracao_min).toBe(5);
    expect(paradas[1]!.duracao_min).toBe(7);
  });

  it('parada no fim da trajetória (sem ponto de saída) também conta', () => {
    const pontos = [
      p(BASE.lat - 0.02, BASE.lng, 0),
      p(BASE.lat, BASE.lng, 1),
      p(BASE.lat, BASE.lng, 9), // terminou parado: 8 min
    ];
    const paradas = detectarParadas(pontos);
    expect(paradas).toHaveLength(1);
    expect(paradas[0]!.duracao_min).toBe(8);
  });
});
