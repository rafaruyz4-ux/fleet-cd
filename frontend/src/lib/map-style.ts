/**
 * Basemap "Dark Matter" da CARTO em tiles VETORIAIS — mesmo tema escuro
 * NEXUS FROTA, mas o MapLibre desenha na GPU: zoom suave, sem o borrão de
 * esticar PNG enquanto os tiles raster não chegam. Gratuito e sem token
 * (atribuição OSM + CARTO já embutida no style). Para alto volume em
 * produção, considerar um plano pago da CARTO ou hospedar tiles próprios.
 */
export const BASE_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

/** Centro padrão (São Paulo) quando não há pontos para enquadrar. */
export const DEFAULT_CENTER: [number, number] = [-46.633, -23.55]
