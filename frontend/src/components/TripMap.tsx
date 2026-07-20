import { useEffect, useRef, useState } from 'react'
import maplibregl, { type ExpressionSpecification, type GeoJSONSource } from 'maplibre-gl'
import { Crosshair, Route } from 'lucide-react'
import type { Alerta, LatLng, ParadaDetectada, PontoTrajeto } from '@/types'
import { cn } from '@/lib/utils'
import { formatHora, haversineM } from '@/lib/geo'
import { BASE_MAP_STYLE, DEFAULT_CENTER } from '@/lib/map-style'

/** Ponto para o qual o mapa deve "voar" (zoom). nonce força repetir o voo. */
export interface FocoMapa {
  lng: number
  lat: number
  nonce: number
}

interface TripMapProps {
  pontos: PontoTrajeto[]
  /** Linha do trajeto já encaixada nas ruas (map matching). Se ausente, liga os pontos. */
  linhaRuas?: LatLng[] | null
  rota?: LatLng[] | null
  alertas?: Alerta[]
  /** Paradas automáticas detectadas pelo backend (clusters de 5+ min). */
  paradasDetectadas?: ParadaDetectada[]
  foco?: FocoMapa | null
  className?: string
  /** A busca do trajeto (/posicoes) falhou — mostra erro em vez de "sem GPS ainda". */
  erroTrajeto?: boolean
  onTentarNovamente?: () => void
}

const ALERTA_COR: Record<string, string> = {
  velocidade_alta: '#ef4444',
  desvio_rota: '#fb923c',
  parada_longa: '#fbbf24',
  sem_gps: '#94a3b8',
}

// ---- Cor por velocidade (C2) ----
const COR_VEL_BAIXA = '#22c55e' // até 60 km/h
const COR_VEL_MEDIA = '#eab308' // 60–90 km/h
const COR_VEL_ALTA = '#ef4444' // acima de 90 km/h

function corDaVelocidade(kmh: number): string {
  if (kmh > 90) return COR_VEL_ALTA
  if (kmh > 60) return COR_VEL_MEDIA
  return COR_VEL_BAIXA
}

// Teto de pontos usados para montar o gradiente (viagens longas → amostra).
const MAX_PONTOS_GRADIENTE = 500

/**
 * Expressão de `line-gradient` que pinta o trajeto por velocidade: cada ponto
 * vira um "stop" na fração da distância acumulada. Como o line-progress do
 * MapLibre também é por distância, as cores caem no lugar certo — inclusive
 * na linha encaixada nas ruas (mesmo caminho ≈ mesmas frações).
 */
function gradientePorVelocidade(todos: PontoTrajeto[]): ExpressionSpecification {
  const constante = (cor: string): ExpressionSpecification =>
    ['interpolate', ['linear'], ['line-progress'], 0, cor, 1, cor] as ExpressionSpecification

  const passo = Math.max(1, Math.ceil(todos.length / MAX_PONTOS_GRADIENTE))
  const pontos = passo > 1 ? todos.filter((_, i) => i % passo === 0) : todos
  if (pontos.length < 2) return constante(COR_VEL_BAIXA)

  // Distância acumulada até cada ponto (fração de line-progress).
  const acumulada: number[] = [0]
  let total = 0
  for (let i = 1; i < pontos.length; i++) {
    total += haversineM(pontos[i - 1]!, pontos[i]!)
    acumulada.push(total)
  }
  if (total <= 0) return constante(COR_VEL_BAIXA)

  // Cor de cada trecho: velocidade reportada no fim do trecho; senão a implícita.
  const cores: string[] = []
  for (let i = 1; i < pontos.length; i++) {
    const dtS =
      (new Date(pontos[i]!.registrado_em).getTime() -
        new Date(pontos[i - 1]!.registrado_em).getTime()) /
      1000
    const distM = acumulada[i]! - acumulada[i - 1]!
    const kmh = pontos[i]!.velocidade_kmh ?? (dtS > 0 ? (distM / dtS) * 3.6 : 0)
    cores.push(corDaVelocidade(kmh))
  }

  // Um stop por mudança de cor (frações estritamente crescentes).
  const expr: (string | number | unknown[])[] = ['step', ['line-progress'], cores[0]!]
  let ultimaCor = cores[0]!
  let ultimaFrac = 0
  for (let i = 1; i < cores.length; i++) {
    if (cores[i] === ultimaCor) continue
    const frac = Math.min(1, Math.max(ultimaFrac + 1e-6, acumulada[i]! / total))
    expr.push(frac, cores[i]!)
    ultimaCor = cores[i]!
    ultimaFrac = frac
  }
  if (expr.length === 3) return constante(ultimaCor)
  return expr as unknown as ExpressionSpecification
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

// Parada automática detectada: ícone de "pausa" (duas barras).
function elParadaDetectada(): HTMLElement {
  const el = document.createElement('div')
  el.className =
    'flex h-5 w-5 items-center justify-center gap-[3px] rounded-full bg-slate-200 shadow-md ring-2 ring-slate-900'
  el.innerHTML =
    '<span class="h-2 w-[3px] rounded-sm bg-slate-900"></span>' +
    '<span class="h-2 w-[3px] rounded-sm bg-slate-900"></span>'
  return el
}

/**
 * Mapa de uma viagem (tema escuro "central de controle"): basemap dark,
 * trajetória GPS colorida por velocidade (verde/amarelo/vermelho), opção de
 * "seguir ruas" (map matching), rota planejada tracejada, marcadores de
 * início/posição-atual (pulsando), pinos de alerta, paradas detectadas,
 * legenda, botão de recentralizar e "voo" até um ponto quando `foco` muda.
 */
export function TripMap({
  pontos,
  linhaRuas,
  rota,
  alertas,
  paradasDetectadas,
  foco,
  className,
  erroTrajeto,
  onTentarNovamente,
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadedRef = useRef(false)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const focoMarkerRef = useRef<maplibregl.Marker | null>(null)
  const resizeObsRef = useRef<ResizeObserver | null>(null)
  // Enquadra o trajeto só no PRIMEIRO desenho: os polls seguintes não podem
  // "roubar" o pan/zoom de quem está explorando o mapa.
  const enquadrouRef = useRef(false)
  // Reexecuta o enquadramento sob demanda (botão "recentralizar").
  const recentrarRef = useRef<(() => void) | null>(null)
  // "Seguir ruas": desenha a linha encaixada no asfalto quando disponível.
  const [seguirRuas, setSeguirRuas] = useState(true)
  const temRuas = !!linhaRuas && linhaRuas.length >= 2

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
      enquadrouRef.current = false
    }
  }, [])

  // Atualiza dados (trajetória, rota, marcadores) quando mudam.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const render = () => {
      // Pontos brutos do GPS (para marcadores início/atual).
      const trajetoCoords = pontos.map((p) => [p.lng, p.lat] as [number, number])
      // Linha desenhada: a versão encaixada nas ruas quando disponível E o
      // toggle "Seguir ruas" estiver ligado; senão liga os pontos brutos.
      const linhaCoords =
        temRuas && seguirRuas
          ? linhaRuas!.map((p) => [p.lng, p.lat] as [number, number])
          : trajetoCoords
      const rotaCoords = (rota ?? []).map((p) => [p.lng, p.lat] as [number, number])

      ;(map.getSource('trajeto') as GeoJSONSource | undefined)?.setData(lineFC(linhaCoords))
      ;(map.getSource('rota') as GeoJSONSource | undefined)?.setData(lineFC(rotaCoords))
      // Pinta o trajeto por velocidade (verde ≤60 · amarelo 60–90 · vermelho >90).
      if (map.getLayer('trajeto')) {
        map.setPaintProperty('trajeto', 'line-gradient', gradientePorVelocidade(pontos))
      }

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

      // Paradas automáticas detectadas (ícone de pausa).
      for (const p of paradasDetectadas ?? []) {
        addMarker(
          p.lng,
          p.lat,
          elParadaDetectada(),
          `Parado ${p.duracao_min}min (${formatHora(p.inicio)}–${formatHora(p.fim)})`,
        )
      }

      // Enquadra todos os pontos relevantes — só no primeiro desenho ou pelo
      // botão "recentralizar"; os refetches não mexem no pan/zoom do usuário.
      const all = [...linhaCoords, ...rotaCoords]
      const enquadrar = () => {
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
      recentrarRef.current = enquadrar
      if (!enquadrouRef.current && all.length > 0) {
        enquadrar()
        enquadrouRef.current = true
      }
    }

    if (loadedRef.current) render()
    else map.once('fleet:ready', render)
  }, [pontos, linhaRuas, rota, alertas, paradasDetectadas, seguirRuas, temRuas])

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
      {erroTrajeto ? (
        // ERRO ≠ VAZIO: se a busca do trajeto falhou, avisa e oferece repetir.
        <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-red-400/30 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-red-300 shadow-md backdrop-blur">
            Erro ao carregar o trajeto.
            {onTentarNovamente && (
              <button
                type="button"
                onClick={onTentarNovamente}
                className="rounded-full bg-red-400/15 px-2 py-0.5 font-semibold text-red-200 transition-colors hover:bg-red-400/25"
              >
                Tentar de novo
              </button>
            )}
          </div>
        </div>
      ) : (
        semTrajeto && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
            <div className="rounded-full border border-white/10 bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-md backdrop-blur">
              Sem trajeto GPS ainda — aparece aqui quando o motorista enviar a localização.
            </div>
          </div>
        )
      )}

      {/* Controles do trajeto (canto superior esquerdo) */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5">
        {temRuas && (
          <button
            type="button"
            onClick={() => setSeguirRuas((v) => !v)}
            title={seguirRuas ? 'Mostrando o trajeto encaixado nas ruas' : 'Mostrando a linha crua do GPS'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-md backdrop-blur transition-colors',
              seguirRuas
                ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-300'
                : 'border-white/10 bg-slate-900/85 text-slate-300 hover:text-slate-100',
            )}
          >
            <Route className="h-3.5 w-3.5" /> Seguir ruas
          </button>
        )}
        {!semTrajeto && (
          <button
            type="button"
            onClick={() => recentrarRef.current?.()}
            title="Recentralizar o mapa no trajeto"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/85 px-2.5 py-1.5 text-xs font-medium text-slate-300 shadow-md backdrop-blur transition-colors hover:text-slate-100"
          >
            <Crosshair className="h-3.5 w-3.5" /> Recentralizar
          </button>
        )}
      </div>

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
          <span className="flex w-4 overflow-hidden rounded-full">
            <span className="h-1 w-1/3 bg-green-500" />
            <span className="h-1 w-1/3 bg-yellow-500" />
            <span className="h-1 w-1/3 bg-red-500" />
          </span>
          Velocidade ≤60 · 60–90 · &gt;90 km/h
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
        <li className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 items-center justify-center gap-[1.5px] rounded-full bg-slate-200 ring-2 ring-slate-900">
            <span className="h-1 w-[1.5px] bg-slate-900" />
            <span className="h-1 w-[1.5px] bg-slate-900" />
          </span>
          Parada detectada
        </li>
      </ul>
    </div>
  )
}
