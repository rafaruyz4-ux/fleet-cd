import type { StyleSpecification } from 'maplibre-gl'

/**
 * Estilo raster baseado em OpenStreetMap — sem necessidade de token/billing.
 * Adequado para uso interno/desenvolvimento (respeitar a política de uso de
 * tiles do OSM em produção de alto volume → trocar por um provedor próprio).
 */
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

/** Centro padrão (São Paulo) quando não há pontos para enquadrar. */
export const DEFAULT_CENTER: [number, number] = [-46.633, -23.55]
