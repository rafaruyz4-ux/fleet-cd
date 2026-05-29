/*
 * Simulador de GPS em tempo real — emula o app do motorista enviando posições.
 *
 * Cria veículo + motorista (com senha) + rota planejada + viagem, inicia a
 * viagem e fica postando posições GPS ao longo da rota a cada poucos segundos,
 * disparando alguns alertas (velocidade alta, desvio de rota). Abra o detalhe
 * da viagem no dashboard (o mapa atualiza sozinho a cada 15s) e assista.
 *
 * Uso: node scripts/simular-gps.mjs [intervaloSegundos]
 * Requer a API no ar em http://localhost:3000.
 */
const API = process.env.API_URL ?? 'http://localhost:3000'
const INTERVALO_MS = (Number(process.argv[2]) || 4) * 1000
const ADMIN = { email: 'admin@cd.local', senha: 'trocar-senha-123' }

// ---------------------------------------------------------------------
// Helpers HTTP
// ---------------------------------------------------------------------
async function req(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${data?.error ?? text}`)
  }
  return data
}

// ---------------------------------------------------------------------
// Geradores (placa Mercosul e CPF válidos)
// ---------------------------------------------------------------------
const rnd = (n) => Math.floor(Math.random() * n)
function gerarPlaca() {
  const L = () => String.fromCharCode(65 + rnd(26))
  return `${L()}${L()}${L()}${rnd(10)}${L()}${rnd(10)}${rnd(10)}`
}
function gerarCpf() {
  const n = Array.from({ length: 9 }, () => rnd(10))
  const dig = (arr) => {
    const s = arr.reduce((acc, v, i) => acc + v * (arr.length + 1 - i), 0)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dig(n)
  const d2 = dig([...n, d1])
  return [...n, d1, d2].join('')
}

// ---------------------------------------------------------------------
// Rota (São Paulo): waypoints e interpolação
// ---------------------------------------------------------------------
const WAYPOINTS = [
  { lat: -23.5613, lng: -46.6565 }, // Av. Paulista
  { lat: -23.5662, lng: -46.6614 },
  { lat: -23.5705, lng: -46.6688 },
  { lat: -23.5748, lng: -46.6792 },
  { lat: -23.5779, lng: -46.6895 },
  { lat: -23.5801, lng: -46.701 }, // destino
]

function interpolar(pontos, passosPorTrecho) {
  const out = []
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i]
    const b = pontos[i + 1]
    for (let s = 0; s < passosPorTrecho; s++) {
      const t = s / passosPorTrecho
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
    }
  }
  out.push(pontos[pontos.length - 1])
  return out
}

async function main() {
  console.log(`[sim] API: ${API} | intervalo: ${INTERVALO_MS / 1000}s`)

  // 1. Login gestor
  const { accessToken: gestor } = await req('POST', '/api/auth/login', ADMIN)

  // 2. Veículo
  const placa = gerarPlaca()
  const veiculo = await req('POST', '/api/veiculos', { placa, tipo: 'caminhao', modelo: 'Simulador' }, gestor)
  console.log(`[sim] veículo criado: ${placa}`)

  // 3. Motorista com senha (para login no "app")
  const cpf = gerarCpf()
  const senhaMot = 'sim12345'
  await req(
    'POST',
    '/api/motoristas',
    { nome: 'Motorista Simulado', cpf, categoria_cnh: 'D', senha: senhaMot },
    gestor,
  )
  console.log(`[sim] motorista criado: CPF ${cpf}`)

  // 4. Rota planejada (linha = waypoints)
  const rota = await req(
    'POST',
    '/api/rotas',
    { tipo: 'fixa', nome: 'Rota Simulada (Paulista→Oeste)', raio_tolerancia_m: 200, linha: WAYPOINTS },
    gestor,
  )

  // 5. Viagem + iniciar
  const veiculoId = veiculo.id
  const motoristaId = (await req('GET', '/api/motoristas', null, gestor)).find((m) =>
    m.cpf.replace(/\D/g, '') === cpf,
  ).id
  const viagem = await req(
    'POST',
    '/api/viagens',
    { veiculo_id: veiculoId, motorista_id: motoristaId, rota_planejada_id: rota.id, km_inicial: 1000 },
    gestor,
  )
  await req('POST', `/api/viagens/${viagem.id}/iniciar`, {}, gestor)

  // 6. Login do motorista → token do "app"
  const { accessToken: motorista } = await req('POST', '/api/auth/motorista/login', {
    cpf,
    senha: senhaMot,
  })

  console.log('\n========================================================')
  console.log('  ABRA NO DASHBOARD:')
  console.log(`  http://localhost:5173/viagens/${viagem.id}`)
  console.log('  (o mapa atualiza sozinho a cada 15s)')
  console.log('========================================================\n')

  // 7. Stream de posições
  const trajeto = interpolar(WAYPOINTS, 8) // ~41 pontos
  for (let i = 0; i < trajeto.length; i++) {
    let p = { ...trajeto[i] }
    let velocidade = 35 + rnd(25) // 35–60 km/h normal

    // Dispara alertas em pontos específicos:
    if (i === 12) {
      velocidade = 132 // → velocidade_alta (>110)
      console.log(`[sim] ponto ${i}: VELOCIDADE ALTA (${velocidade} km/h)`)
    }
    if (i === 22) {
      p = { lat: p.lat + 0.012, lng: p.lng + 0.012 } // ~1.7km fora → desvio_rota
      console.log(`[sim] ponto ${i}: DESVIO DE ROTA (fora do raio)`)
    }

    const r = await req(
      'POST',
      `/api/app/viagens/${viagem.id}/posicoes`,
      {
        posicoes: [
          {
            lat: Number(p.lat.toFixed(6)),
            lng: Number(p.lng.toFixed(6)),
            velocidade_kmh: velocidade,
            precisao_m: 5,
            registrado_em: new Date().toISOString(),
          },
        ],
      },
      motorista,
    )
    const tag = r.alertas?.length ? ` ⚠️ +${r.alertas.length} alerta(s): ${r.alertas.map((a) => a.tipo).join(', ')}` : ''
    console.log(`[sim] ${i + 1}/${trajeto.length} enviado (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})${tag}`)

    if (i < trajeto.length - 1) await new Promise((r) => setTimeout(r, INTERVALO_MS))
  }

  console.log('\n[sim] trajeto concluído. A viagem segue em andamento (encerre pelo dashboard se quiser).')
  console.log(`[sim] viagem: ${viagem.id}`)
}

main().catch((e) => {
  console.error('[sim] ERRO:', e.message)
  process.exit(1)
})
