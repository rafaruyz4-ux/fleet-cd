/*
 * Detecção de paradas automáticas a partir das posições de GPS de uma viagem.
 *
 * Um "cluster" de pontos onde o veículo ficou a menos de PARADA_RAIO_M do
 * centro por PARADA_MIN_MS ou mais vira uma parada detectada. Calculado
 * on-read (sem tabela nova): a trajetória já vem ordenada por registrado_em.
 */

const PARADA_RAIO_M = 60; // raio máximo do cluster para considerar "parado"
const PARADA_MIN_MS = 5 * 60 * 1000; // tempo mínimo parado para virar parada

export interface PontoParada {
  lat: number;
  lng: number;
  /** epoch ms de registrado_em */
  time: number;
}

export interface ParadaDetectada {
  lat: number; // centro do cluster (média dos pontos)
  lng: number;
  inicio: string; // ISO do primeiro ponto do cluster
  fim: string; // ISO do último ponto do cluster
  duracao_min: number;
}

/** Distância aproximada em metros entre dois pontos (haversine). */
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Varre os pontos (já ordenados por tempo) agrupando os consecutivos que
 * ficaram dentro de PARADA_RAIO_M do centro do cluster; clusters com duração
 * de PARADA_MIN_MS ou mais viram paradas.
 */
export function detectarParadas(pontos: PontoParada[]): ParadaDetectada[] {
  const paradas: ParadaDetectada[] = [];
  if (pontos.length === 0) return paradas;

  // Cluster corrente: índice inicial + somatórios para o centro (média).
  let inicio = 0;
  let somaLat = pontos[0]!.lat;
  let somaLng = pontos[0]!.lng;
  let n = 1;

  const fecharCluster = (fim: number) => {
    const duracaoMs = pontos[fim]!.time - pontos[inicio]!.time;
    if (duracaoMs >= PARADA_MIN_MS) {
      paradas.push({
        lat: somaLat / n,
        lng: somaLng / n,
        inicio: new Date(pontos[inicio]!.time).toISOString(),
        fim: new Date(pontos[fim]!.time).toISOString(),
        duracao_min: Math.round(duracaoMs / 60000),
      });
    }
  };

  for (let i = 1; i < pontos.length; i++) {
    const p = pontos[i]!;
    const centro = { lat: somaLat / n, lng: somaLng / n };
    if (haversineM(p, centro) <= PARADA_RAIO_M) {
      // Continua parado: o ponto entra no cluster.
      somaLat += p.lat;
      somaLng += p.lng;
      n++;
    } else {
      // Saiu do raio: fecha o cluster anterior e começa outro neste ponto.
      fecharCluster(i - 1);
      inicio = i;
      somaLat = p.lat;
      somaLng = p.lng;
      n = 1;
    }
  }
  fecharCluster(pontos.length - 1);

  return paradas;
}
