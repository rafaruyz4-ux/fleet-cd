import { useEffect, useRef } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import type { Alerta, LatLng, PontoTrajeto } from '@/types'
import { cn } from '@/lib/utils'
import { BASE_MAP_STYLE, DEFAULT_CENTER } from '@/lib/map-style'

/** Ponto para o qual o mapa deve "voar" (zoom). nonce força repetir o voo. */
export interface FocoMapa {
  lng: number
  lat: number
  nonce: number
}

interface TripMapProps {
  pontos: PontoTrajeto[]
  rota?: LatLng[] | null
  alertas?: Alerta[]
  foco?: FocoMapa | null
  className?: string
}

const ALERTA_COR: Record<string, string> = {
  velocidade_alta: '#ef4444',
  desvio_rota: '#fb923c',
  parada_longa: '#fbbf24',
  sem_gps: '#94a3b8',
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

// ---- Marcadores customizados (HTML) ----
function elInicio(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'h-3.5 w-3.5 rounded-full bg-emerald-400 shadow ring-2 ring-slate-900'
  return el
}

function elPosicaoAtual(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'relative flex h-4 w-4 items-center justify-center'
  el.innerHTML =
    '<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/70"></span>' +
    '<span class="relative inline-flex h-3 w-3 rounded-full bg-cyan-400 shadow ring-2 ring-slate-900"></span>'
  return el
}

function elAlerta(cor: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'flex h-5 w-5 items-center justify-center rounded-full shadow-md ring-2 ring-slate-900'
  el.style.backgroundColor = cor
  el.innerHTML = '<span class="h-1.5 w-1.5 rounded-full bg-white"></span>'
  return el
}

// Anel de destaque mostrado no ponto para onde o mapa "voou".
function elFoco(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'relative flex h-6 w-6 items-center justify-center'
  el.innerHTML =
    '<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/70"></span>' +
    '<span class="relative inline-flex h-3 w-3 rounded-full bg-amber-400 shadow ring-2 ring-white"></span>'
  return el
}

/**
 * Mapa de uma viagem (tema escuro "central de controle"): basemap dark,
 * trajetória GPS com brilho + gradiente ciano→azul, rota planejada tracejada,
 * marcadores de início/posição-atual (pulsando), pinos de alerta, legenda, e
 * "voo" até um ponto quando `foco` muda (clique em alerta/parada).
 */
export function TripMap({ pontos, rota, alertas, foco, className }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadedRef = useRef(false)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const focoMarkerRef = useRef<maplibregl.Marker | null>(null)
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

    // Redesenha quando o container ganha/altera tamanho (lazy/Suspense pode
    // medir o container só depois do init → mapa em branco sem isto).
    const obs = new ResizeObserver(() => map.resize())
    obs.observe(containerRef.current)
    resizeObsRef.current = obs

    map.on('load', () => {
      map.addSource('trajeto', { type: 'geojson', data: lineFC([]), lineMetrics: true })
      map.addSource('rota', { type: 'geojson', data: lineFC([]) })

      // Rota planejada (por baixo): tracejada, discreta.
      map.addLayer({
        id: 'rota',
        type: 'line',
        source: 'rota',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#64748b',
          'line-width': 2.5,
          'line-dasharray': [1.5, 2],
          'line-opacity': 0.8,
        },
      })
      // Brilho do trajeto (halo ciano) — efeito "central de controle".
      map.addLayer({
        id: 'trajeto-glow',
        type: 'line',
        source: 'trajeto',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#22d3ee', 'line-width': 13, 'line-opacity': 0.22, 'line-blur': 6 },
      })
      // Trajeto principal com gradiente ciano→azul.
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
            '#22d3ee',
            1,
            '#3b82f6',
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
            elAlerta(ALERTA_COR[a.tipo] ?? '#ef4444'),
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

  // "Voa" até um ponto quando `foco` muda (clique em alerta/parada).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !foco) return
    const irAoFoco = () => {
      focoMarkerRef.current?.remove()
      focoMarkerRef.current = new maplibregl.Marker({ element: elFoco() })
        .setLngLat([foco.lng, foco.lat])
        .addTo(map)
      map.flyTo({ center: [foco.lng, foco.lat], zoom: 16, duration: 900, essential: true })
    }
    if (loadedRef.current) irAoFoco()
    else map.once('fleet:ready', irAoFoco)
  }, [foco])

  const semTrajeto = pontos.length === 0

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div ref={containerRef} className="h-full w-full" />
      {semTrajeto && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
          <div className="rounded-full border border-white/10 bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-md backdrop-blur">
            Sem trajeto GPS ainda — aparece aqui quando o motorista enviar a localização.
          </div>
        </div>
      )}
      <MapaLegenda />
    </div>
  )
}

// Legenda flutuante (vidro escuro) no canto inferior esquerdo.
function MapaLegenda() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-white/10 bg-slate-900/85 px-3 py-2 text-xs text-slate-200 shadow-lg backdrop-blur">
      <ul className="space-y-1">
        <li className="flex items-center gap-2">
          <span className="h-1 w-4 rounded-full bg-cyan-400" />
          Trajeto percorrido
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-slate-400" />
          Rota planejada
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
          Início
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 ring-2 ring-slate-900" />
          Posição atual
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-slate-900" />
          Alerta / ponto focado
        </li>
      </ul>
    </div>
  )
}
