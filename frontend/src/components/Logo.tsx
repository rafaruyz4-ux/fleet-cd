/**
 * Marca NEXUS FROTA (nome trocado em 30/07/2026; era VETRA): "V" geométrico
 * cujo braço direito é um "7" — símbolo recriado em vetor a partir do board de
 * inspiração, nas cores da paleta oficial (azul #2D6BFF + claro #F5F7FA sobre
 * escuro #0A0E14). Só o nome mudou; símbolo e cores ficaram.
 */
export const VETRA_AZUL = '#2D6BFF'
export const VETRA_CLARO = '#F5F7FA'

export function VetraMark({
  className,
  claro = VETRA_CLARO,
}: {
  className?: string
  /** Cor do braço esquerdo do V — trocar quando o fundo for claro. */
  claro?: string
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      {/* braço esquerdo do V */}
      <path d="M6 12H27L59 90H38Z" fill={claro} />
      {/* o "7" — barra no topo e perna que fecha o V */}
      <path d="M44 12H94L62 90L53 68L70 27H44Z" fill={VETRA_AZUL} />
    </svg>
  )
}

/** Assinatura completa: símbolo + wordmark + tagline (sidebar e topo mobile). */
export function VetraLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <VetraMark className="h-8 w-8 shrink-0" />
      <div className="leading-tight">
        <div className="whitespace-nowrap font-display text-base font-extrabold tracking-[0.14em] text-foreground">
          NEXUS FROTA
        </div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Inteligência em Movimento
        </div>
      </div>
    </div>
  )
}
