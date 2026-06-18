/*
 * Map matching: "encaixa" uma sequência de pontos de GPS na malha de ruas,
 * devolvendo a linha que segue exatamente as ruas por onde o veículo passou.
 *
 * Usa o serviço público gratuito Valhalla (FOSSGIS) via /trace_route com
 * shape_match=map_snap. Sem token. Configurável por env para produção
 * (instância própria/paga). Em qualquer falha retorna null → o chamador
 * cai para a linha bruta (reta entre pontos), então o mapa nunca quebra.
 */

const VALHALLA_URL = process.env.MAPMATCH_VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de';
const MAX_PONTOS = 200; // amostra para não estourar o serviço/payload
const TIMEOUT_MS = 8000;

export interface PontoLatLng {
  lat: number;
  lng: number;
}

/** Decodifica polyline da Valhalla (precisão 6 / fator 1e6) em [lng,lat][]. */
function decodePolyline6(str: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coords: [number, number][] = [];
  while (index < str.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

/**
 * Encaixa os pontos nas ruas. Retorna a linha [lng,lat][] que segue as ruas,
 * ou null se não for possível (serviço fora, sem match, poucos pontos…).
 */
export async function matchTrajeto(pontos: PontoLatLng[]): Promise<[number, number][] | null> {
  if (pontos.length < 2) return null;

  // Reduz para no máximo MAX_PONTOS mantendo a ordem.
  const passo = Math.max(1, Math.ceil(pontos.length / MAX_PONTOS));
  const amostra = pontos.filter((_, i) => i % passo === 0);
  const shape = amostra.map((p) => ({ lat: p.lat, lon: p.lng }));

  try {
    const resp = await fetch(`${VALHALLA_URL}/trace_route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape, costing: 'auto', shape_match: 'map_snap' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { trip?: { legs?: Array<{ shape?: string }> } };
    const legs = data.trip?.legs;
    if (!Array.isArray(legs) || legs.length === 0) return null;

    const coords: [number, number][] = [];
    for (const leg of legs) {
      if (leg.shape) coords.push(...decodePolyline6(leg.shape));
    }
    return coords.length >= 2 ? coords : null;
  } catch {
    return null;
  }
}

// Exporta o decodificador para testes.
export const __test = { decodePolyline6 };
