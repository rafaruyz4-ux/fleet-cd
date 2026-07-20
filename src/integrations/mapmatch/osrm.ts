/*
 * Map matching via OSRM /match (servidor público router.project-osrm.org,
 * gratuito). Usado como plano B quando a Valhalla falha: mesma ideia, outra
 * malha. Em qualquer falha retorna null → o chamador cai para a linha bruta.
 */

const OSRM_URL = process.env.MAPMATCH_OSRM_URL ?? 'https://router.project-osrm.org';
const MAX_PONTOS = 100; // limite prático do /match público por chamada
const TIMEOUT_MS = 5000;
const RAIO_MIN_M = 15; // raio mínimo de busca por ponto (GPS bom ainda oscila)
const RAIO_MAX_M = 50; // teto para não "grudar" na rua errada

export interface PontoGpsOsrm {
  lat: number;
  lng: number;
  precisao_m?: number | null;
}

interface OsrmMatchResponse {
  code?: string;
  matchings?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
}

/**
 * Encaixa os pontos nas ruas via OSRM. Retorna a linha [lng,lat][] que segue
 * as ruas, ou null se não der (serviço fora, sem match, poucos pontos…).
 */
export async function matchTrajetoOsrm(pontos: PontoGpsOsrm[]): Promise<[number, number][] | null> {
  if (pontos.length < 2) return null;

  // Reduz para no máximo MAX_PONTOS mantendo a ordem.
  const passo = Math.max(1, Math.ceil(pontos.length / MAX_PONTOS));
  const amostra = pontos.filter((_, i) => i % passo === 0);

  const coords = amostra.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  // Raio de busca por ponto derivado da precisão informada pelo GPS.
  const radiuses = amostra
    .map((p) => Math.min(RAIO_MAX_M, Math.max(RAIO_MIN_M, Math.ceil(p.precisao_m ?? RAIO_MIN_M))))
    .join(';');

  try {
    const url = `${OSRM_URL}/match/v1/driving/${coords}?overview=full&geometries=geojson&radiuses=${radiuses}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as OsrmMatchResponse;
    if (data.code !== 'Ok' || !Array.isArray(data.matchings)) return null;

    // Uma viagem pode voltar em vários "matchings" (trechos); concatenamos.
    const linha: [number, number][] = [];
    for (const m of data.matchings) {
      const cs = m.geometry?.coordinates;
      if (Array.isArray(cs)) linha.push(...cs);
    }
    return linha.length >= 2 ? linha : null;
  } catch {
    return null;
  }
}
