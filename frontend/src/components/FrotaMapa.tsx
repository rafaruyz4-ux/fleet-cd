import { useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import { Crosshair, Route as RouteIcon } from 'lucide-react'
import { useFrotaMapa } from '@/api/hooks'
import type { FrotaVeiculoPosicao } from '@/types'
import { cn } from '@/lib/utils'
import { formatHora } from '@/lib/geo'
import { BASE_MAP_STYLE, DEFAULT_CENTER } from '@/lib/map-style'

// Cor do marcador pela velocidade (mesma régua do trajeto da viagem).
function corDaVelocidade(kmh: number | null): string {
  if (kmh == null) return '#2D6BFF'
  if (kmh > 90) return '#ef4444'
  if (kmh > 60) return '#eab308'
  return '#22c55e'
}

/** Marcador de veículo: bolinha colorida por velocidade + etiqueta com a placa. */
function elVeiculo(placa: string, cor: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'flex cursor-pointer flex-col items-center gap-0.5'
  const dot = document.createElement('span')
  dot.className = 'frota-dot h-3.5 w-3.5 rounded-full shadow ring-2 ring-white'
  dot.style.backgroundColor = cor
  const label = document.createElement('span')
  label.className =
    'frota-placa rounded border border-slate-600/60 bg-[#12161E]/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-100 shadow backdrop-blur'
  label.textContent = placa
  el.appendChild(dot)
  el.appendChild(label)
  return el
}

/**
 * Conteúdo do popup (montado via DOM, textContent — nada entra como HTML):
 * placa, motorista, velocidade, horário da última posição e link p/ a viagem.
 */
function popupVeiculo(v: FrotaVeiculoPosicao, aoVerViagem: () => void): HTMLElement {
  const el = document.createElement('div')
  el.className = 'space-y-1'
  const titulo = document.createElement('div')
  titulo.className = 'text-xs font-semibold text-slate-100'
  titulo.textContent = v.placa
  el.appendChild(titulo)
  const linhas = [
    v.motorista_nome,
    v.velocidade_kmh != null ? `${Math.round(v.velocidade_kmh)} km/h` : 'Velocidade indisponível',
    `Atualizado às ${formatHora(v.registrado_em)}`,
  ]
  for (const linha of linhas) {
    const p = document.createElement('div')
    p.className = 'text-xs text-slate-400'
    p.textContent = linha
    el.appendChild(p)
  }
  const link = document.createElement('button')
  link.type = 'button'
  link.className =
    'mt-1 cursor-pointer text-xs font-medium text-blue-400 hover:underline focus-visible:outline-none'
  link.textContent = 'Ver viagem →'
  link.addEventListener('click', aoVerViagem)
  el.appendChild(link)
  return el
}

/**
 * MAPA GERAL DA FROTA (home): última posição de cada viagem em andamento,
 * no mesmo basemap escuro CARTO Dark Matter vetorial do detalhe da viagem.
 * O polling de 15s NÃO recria o mapa: os marcadores são reconciliados por
 * veiculo_id (setLngLat + conteúdo do popup) e o fitBounds acontece só no
 * primeiro desenho com dados.
 */
export function FrotaMapa({ className }: { className?: string }) {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useFrotaMapa()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const resizeObsRef = useRef<ResizeObserver | null>(null)
  const enquadrouRef = useRef(false)
  const recentrarRef = useRef<(() => void) | null>(null)
  // navigate muda de identidade entre renders — ref para o popup usar a atual
  // (atualizada num effect, nunca durante o render).
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  // Inicializa o mapa uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: 9,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    const obs = new ResizeObserver(() => map.resize())
    obs.observe(containerRef.current)
    resizeObsRef.current = obs
    mapRef.current = map
    const markers = markersRef.current
    return () => {
      resizeObsRef.current?.disconnect()
      resizeObsRef.current = null
      markers.clear()
      map.remove()
      mapRef.current = null
      enquadrouRef.current = false
    }
  }, [])

  // Reconcilia os marcadores a cada resposta do polling.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const veiculos = data?.veiculos ?? []
    const vistos = new Set<string>()

    for (const v of veiculos) {
      vistos.add(v.veiculo_id)
      const cor = corDaVelocidade(v.velocidade_kmh)
      const conteudo = popupVeiculo(v, () => navigateRef.current(`/viagens/${v.viagem_id}`))
      const existente = markersRef.current.get(v.veiculo_id)
      if (existente) {
        existente.setLngLat([v.lng, v.lat])
        existente.getPopup()?.setDOMContent(conteudo)
        const dot = existente.getElement().querySelector<HTMLElement>('.frota-dot')
        if (dot) dot.style.backgroundColor = cor
        const placa = existente.getElement().querySelector<HTMLElement>('.frota-placa')
        if (placa && placa.textContent !== v.placa) placa.textContent = v.placa
      } else {
        const popup = new maplibregl.Popup({ offset: 20, closeButton: false, maxWidth: '280px' })
        popup.setDOMContent(conteudo)
        const m = new maplibregl.Marker({ element: elVeiculo(v.placa, cor) })
          .setLngLat([v.lng, v.lat])
          .setPopup(popup)
          .addTo(map)
        markersRef.current.set(v.veiculo_id, m)
      }
    }

    // Viagens que encerraram somem do mapa.
    for (const [id, m] of markersRef.current) {
      if (!vistos.has(id)) {
        m.remove()
        markersRef.current.delete(id)
      }
    }

    // Enquadra a frota só no primeiro desenho com dados (ou via botão).
    const enquadrar = () => {
      if (veiculos.length === 1) {
        map.easeTo({ center: [veiculos[0]!.lng, veiculos[0]!.lat], zoom: 13 })
      } else if (veiculos.length > 1) {
        const bounds = veiculos.reduce(
          (b, v) => b.extend([v.lng, v.lat]),
          new maplibregl.LngLatBounds(
            [veiculos[0]!.lng, veiculos[0]!.lat],
            [veiculos[0]!.lng, veiculos[0]!.lat],
          ),
        )
        map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 500 })
      }
    }
    recentrarRef.current = enquadrar
    if (!enquadrouRef.current && veiculos.length > 0) {
      enquadrar()
      enquadrouRef.current = true
    }
  }, [data])

  const veiculos = data?.veiculos ?? []
  const vazio = !isLoading && !isError && veiculos.length === 0

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div ref={containerRef} className="h-full w-full" />

      {isError && (
        // ERRO ≠ VAZIO: a busca das posições falhou — avisa e oferece repetir.
        <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-red-500/40 bg-[#12161E]/90 px-3 py-1.5 text-xs font-medium text-red-400 shadow-md backdrop-blur">
            Não foi possível carregar as posições da frota.
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-full bg-red-500/20 px-2 py-0.5 font-semibold text-red-300 transition-colors hover:bg-red-500/30"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      )}

      {vazio && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0A0E14]/55 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-[#12161E]/95 px-6 py-5 text-center shadow-lg">
            <RouteIcon className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum veículo em viagem agora.</p>
            <Link
              to="/viagens"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Criar uma viagem
            </Link>
          </div>
        </div>
      )}

      {veiculos.length > 0 && (
        <div className="absolute left-3 top-3 z-10">
          <button
            type="button"
            onClick={() => recentrarRef.current?.()}
            title="Recentralizar o mapa na frota"
            className="flex items-center gap-1.5 rounded-lg border bg-[#12161E]/90 px-2.5 py-1.5 text-xs font-medium text-slate-400 shadow-md backdrop-blur transition-colors hover:text-slate-100"
          >
            <Crosshair className="h-3.5 w-3.5" /> Recentralizar
          </button>
        </div>
      )}

      {/* Legenda compacta (cores por velocidade) */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border bg-[#12161E]/90 px-3 py-2 text-xs text-slate-300 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex w-4 overflow-hidden rounded-full">
            <span className="h-1 w-1/3 bg-green-500" />
            <span className="h-1 w-1/3 bg-yellow-500" />
            <span className="h-1 w-1/3 bg-red-500" />
          </span>
          Velocidade ≤60 · 60–90 · &gt;90 km/h
        </div>
      </div>
    </div>
  )
}
