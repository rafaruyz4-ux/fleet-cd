/* Formatação pt-BR centralizada. */

const dt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const d = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : dt.format(date)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : d.format(date)
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return brl.format(value)
}

export function formatCpf(cpf: string): string {
  const dig = cpf.replace(/\D/g, '')
  if (dig.length !== 11) return cpf
  return `${dig.slice(0, 3)}.${dig.slice(3, 6)}.${dig.slice(6, 9)}-${dig.slice(9)}`
}
