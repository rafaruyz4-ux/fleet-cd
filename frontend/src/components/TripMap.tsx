import { useEffect, useRef } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import type { Alerta, LatLng, PontoTrajeto } from '@/types'
import { DEFAULT_CENTER, OSM_STYLE } from '@/lib/map-style'

interface TripMapProps {
  pontos: PontoTrajeto[]
  rota?: LatLng[] | null
  alertas?: Alerta[]
  className?: string
}

const ALERTA_COR: Record<string, string> = {
  velocidade_alta: '#dc2626',
  desvio_rota: '#ea580c',
  parada_longa: '#d97706',
  sem_gps: '#64748b',
}

type FC = GeoJSON.FeatureCollection

function lineFC(coords: [number, number][]): FC {
  return {
    type: 'FeatureCollection',
    features: coords.length
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }]
      : [],
  }
}

/**
 * Mapa de uma viagem: trajetória GPS (linha azul), rota planejada (linha
 * tracejada cinza), marcadores de início/fim e de alertas.
 */
export function TripMap({ pontos, rota, alertas, className }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadedRef = useRef(false)
  const markersRef = useRef<maplibregl.Marker[]>([])

  // Inicializa o mapa uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: DEFAULT_CENTER,
      zoom: 10,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => {
      map.addSource('trajeto', { type: 'geojson', data: lineFC([]) })
      map.addSource('rota', { type: 'geojson', data: lineFC([]) })
      map.addLayer({
        id: 'rota',
        type: 'line',
        source: 'rota',
        paint: { 'line-color': '#94a3b8', 'line-width': 3, 'line-dasharray': [2, 2] },
      })
      map.addLayer({
        id: 'trajeto',
        type: 'line',
        source: 'trajeto',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 4 },
      })
      loadedRef.current = true
      mapRef.current = map
      // Dispara o primeiro render de dados.
      map.fire('fleet:ready')
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      loadedRef.current = false
    }
  }, [])

  // Atualiza dados (trajetória, rota, marcadores) quando mudam.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const render = () => {
      const trajetoCoords = pontos.map((p) => [p.lng, p.lat] as [number, number])
      const rotaCoords = (rota ?? []).map((p) => [p.lng, p.lat] as [number, number])

      ;(map.getSource('trajeto') as GeoJSONSource | undefined)?.setData(lineFC(trajetoCoords))
      ;(map.getSource('rota') as GeoJSONSource | undefined)?.setData(lineFC(rotaCoords))

      // Limpa marcadores anteriores.
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      const addMarker = (lng: number, lat: number, color: string, title: string) => {
        const m = new maplibregl.Marker({ color })
          .setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup({ offset: 18 }).setText(title))
          .addTo(map)
        markersRef.current.push(m)
      }

      if (trajetoCoords.length > 0) {
        const first = trajetoCoords[0]!
        const last = trajetoCoords[trajetoCoords.length - 1]!
        addMarker(first[0], first[1], '#16a34a', 'Início')
        if (trajetoCoords.length > 1) addMarker(last[0], last[1], '#1d4ed8', 'Posição atual')
      }

      for (const a of alertas ?? []) {
        if (a.coordenada) {
          addMarker(
            a.coordenada.lng,
            a.coordenada.lat,
            ALERTA_COR[a.tipo] ?? '#dc2626',
            a.descricao ?? a.tipo,
          )
        }
      }

      // Enquadra todos os pontos relevantes.
      const all = [...trajetoCoords, ...rotaCoords]
      if (all.length === 1) {
        map.easeTo({ center: all[0]!, zoom: 14 })
      } else if (all.length > 1) {
        const bounds = all.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(all[0]!, all[0]!),
        )
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 })
      }
    }

    if (loadedRef.current) render()
    else map.once('fleet:ready', render)
  }, [pontos, rota, alertas])

  return <div ref={containerRef} className={className} />
}
