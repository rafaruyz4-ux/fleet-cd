import type { StyleSpecification } from 'maplibre-gl'

/**
 * Basemap "Positron" da CARTO — fundo claro, minimalista e discreto, padrão
 * em produtos de logística/SaaS profissionais. Gratuito e sem token (atribuição
 * obrigatória a OSM + CARTO). Para alto volume em produção, considerar um plano
 * pago da CARTO ou hospedar tiles próprios.
 */
export const BASE_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      // Subdomínios explícitos (MapLibre não expande {s}); @2x = retina nítido.
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap · © CARTO',
    },
  },
  layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
}

/** Centro padrão (São Paulo) quando não há pontos para enquadrar. */
export const DEFAULT_CENTER: [number, number] = [-46.633, -23.55]
