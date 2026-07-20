/* Utilitários de geografia/tempo usados pelo mapa e pelo resumo da viagem. */

/** Distância aproximada em metros entre dois pontos (haversine). */
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat))
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Minutos → "2h 05min" / "45min". */
export function formatDuracaoMin(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  const resto = m % 60
  return resto > 0 ? `${h}h ${String(resto).padStart(2, '0')}min` : `${h}h`
}

/** ISO → "14:35" (hora local). */
export function formatHora(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
