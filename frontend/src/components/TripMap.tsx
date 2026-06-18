import { useEffect, useRef } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import type { Alerta, LatLng, PontoTrajeto } from '@/types'
import { cn } from '@/lib/utils'
import { BASE_MAP_STYLE, DEFAULT_CENTER } from '@/lib/map-style'

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

// ---- Marcadores customizados (HTML), bem mais finos que o pino padrão ----
function elInicio(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'h-3.5 w-3.5 rounded-full bg-emerald-500 shadow ring-2 ring-white'
  return el
}

function elPosicaoAtual(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'relative flex h-4 w-4 items-center justify-center'
  // anel pulsando (ao vivo) + ponto sólido
  el.innerHTML =
    '<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500/60"></span>' +
    '<span class="relative inline-flex h-3 w-3 rounded-full bg-blue-600 shadow ring-2 ring-white"></span>'
  return el
}

function elAlerta(cor: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'flex h-5 w-5 items-center justify-center rounded-full shadow-md ring-2 ring-white'
  el.style.backgroundColor = cor
  el.innerHTML = '<span class="h-1.5 w-1.5 rounded-full bg-white"></span>'
  return el
}

/**
 * Mapa de uma viagem (visual premium): basemap claro, trajetória GPS como
 * "fita" com contorno branco e gradiente índigo→azul, rota planejada tracejada,
 * marcadores de início/posição-atual (pulsando) e pinos de alerta + legenda.
 */
export function TripMap({ pontos, rota, alertas, className }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadedRef = useRef(false)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const resizeObsRef = useRef<ResizeObserver | null>(null)

  // Inicializa o mapa uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: 10,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // Garante que o mapa redesenhe quando o container ganha/altera tamanho
    // (carregamento lazy/Suspense pode mediro container só depois do init → mapa em branco).
    const obs = new ResizeObserver(() => map.resize())
    obs.observe(containerRef.current)
    resizeObsRef.current = obs
    map.on('load', () => {
      // lineMetrics: habilita o gradiente ao longo do trajeto.
      map.addSource('trajeto', { type: 'geojson', data: lineFC([]), lineMetrics: true })
      map.addSource('rota', { type: 'geojson', data: lineFC([]) })

      // Rota planejada (por baixo): tracejada, discreta.
      map.addLayer({
        id: 'rota',
        type: 'line',
        source: 'rota',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#94a3b8',
          'line-width': 2.5,
          'line-dasharray': [1.5, 2],
          'line-opacity': 0.9,
        },
      })
      // Contorno branco do trajeto (dá o efeito "fita" elevada).
      map.addLayer({
        id: 'trajeto-casing',
        type: 'line',
        source: 'trajeto',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.95 },
      })
      // Trajeto principal com gradiente índigo→azul.
      map.addLayer({
        id: 'trajeto',
        type: 'line',
        source: 'trajeto',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': 4.5,
          'line-gradient': [
            'interpolate',
            ['linear'],
            ['line-progress'],
            0,
            '#6366f1',
            1,
            '#2563eb',
          ],
        },
      })

      loadedRef.current = true
      mapRef.current = map
      map.fire('fleet:ready')
    })
    mapRef.current = map
    return () => {
      resizeObsRef.current?.disconnect()
      resizeObsRef.current = null
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

      const addMarker = (lng: number, lat: number, el: HTMLElement, title: string) => {
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup({ offset: 16 }).setText(title))
          .addTo(map)
        markersRef.current.push(m)
      }

      if (trajetoCoords.length > 0) {
        const first = trajetoCoords[0]!
        const last = trajetoCoords[trajetoCoords.length - 1]!
        addMarker(first[0], first[1], elInicio(), 'Início')
        if (trajetoCoords.length > 1) addMarker(last[0], last[1], elPosicaoAtual(), 'Posição atual')
      }

      for (const a of alertas ?? []) {
        if (a.coordenada) {
          addMarker(
            a.coordenada.lng,
            a.coordenada.lat,
            elAlerta(ALERTA_COR[a.tipo] ?? '#dc2626'),
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
        map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 500 })
      }
    }

    if (loadedRef.current) render()
    else map.once('fleet:ready', render)
  }, [pontos, rota, alertas])

  const semTrajeto = pontos.length === 0

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div ref={containerRef} className="h-full w-full" />
      {/* O mapa sempre aparece; sem GPS, mostramos um aviso POR CIMA dele. */}
      {semTrajeto && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
          <div className="rounded-full border border-black/5 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-md backdrop-blur">
            Sem trajeto GPS ainda — aparece aqui quando o motorista enviar a localização.
          </div>
        </div>
      )}
      <MapaLegenda />
    </div>
  )
}

// Legenda flutuante (canto inferior esquerdo).
function MapaLegenda() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-black/5 bg-white/90 px-3 py-2 text-xs shadow-md backdrop-blur">
      <ul className="space-y-1">
        <li className="flex items-center gap-2">
          <span className="h-1 w-4 rounded-full bg-blue-600" />
          Trajeto percorrido
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-slate-400" />
          Rota planejada
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          Início
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-white" />
          Posição atual
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
          Alerta
        </li>
      </ul>
    </div>
  )
}
