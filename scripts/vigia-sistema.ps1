# Vigia do NEXUS FROTA - roda a cada 5 min pelo Task Scheduler (tarefa "NexusFrota-Vigia").
# Checa o /health do sistema; se estiver fora do ar: tenta subir o Docker/containers
# sozinho, registra o incidente e avisa o usuario com uma mensagem na tela.
# ATENCAO: manter 100% ASCII (PowerShell 5.1 le .ps1 sem BOM como ANSI).

$ErrorActionPreference = 'SilentlyContinue'

$Url        = 'http://localhost:8080/health'
$Docker     = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$DockerApp  = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$Containers = @('fleet-cd-prod-postgres-1','fleet-cd-prod-redis-1','fleet-cd-prod-api-1','fleet-cd-prod-web-1')
$PastaVigia = 'C:\Users\mdena\OneDrive - Nexus Orbital\CEREBRO RAFAEL\PROJETOS\Fleet-CD\vigia'
$Log        = Join-Path $PastaVigia 'vigia-log.txt'
$Estado     = Join-Path $PastaVigia 'estado.txt'   # 'ok' ou 'fora' - pra logar so as viradas

if (-not (Test-Path $PastaVigia)) { New-Item -ItemType Directory -Force $PastaVigia | Out-Null }

function Registrar($msg) {
    $linha = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $Log -Value $linha -Encoding UTF8
}

function TestaSaude {
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

function Avisar($texto) {
    # msg.exe mostra um alerta na tela do usuario logado
    try { & msg.exe $env:USERNAME /TIME:120 $texto } catch {}
}

$estadoAnterior = 'ok'
if (Test-Path $Estado) { $estadoAnterior = (Get-Content $Estado -TotalCount 1) }

if (TestaSaude) {
    if ($estadoAnterior -ne 'ok') {
        Registrar 'RECUPERADO  sistema respondendo de novo'
        Avisar 'NEXUS FROTA: sistema voltou ao ar.'
    }
    Set-Content -Path $Estado -Value 'ok' -Encoding UTF8
    exit 0
}

# --- Sistema fora do ar: tentar recuperar sozinho ---
Registrar ('FORA DO AR  ' + $Url + ' nao respondeu; iniciando recuperacao')

# 1) Docker engine esta de pe?
& $Docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Registrar 'RECUPERACAO  Docker engine parado; abrindo Docker Desktop'
    Start-Process $DockerApp
    $limite = (Get-Date).AddMinutes(4)
    do {
        Start-Sleep -Seconds 15
        & $Docker info *> $null
    } until ($LASTEXITCODE -eq 0 -or (Get-Date) -gt $limite)
}

# 2) Subir os containers de producao (docker start basta: eles ja existem)
& $Docker start $Containers *> $null
Registrar 'RECUPERACAO  docker start executado; aguardando saude'

# 3) Esperar ate 3 min pelo /health
$limite = (Get-Date).AddMinutes(3)
$voltou = $false
do {
    Start-Sleep -Seconds 15
    if (TestaSaude) { $voltou = $true; break }
} until ((Get-Date) -gt $limite)

if ($voltou) {
    Registrar 'RECUPERADO  sistema voltou apos recuperacao automatica'
    Avisar 'NEXUS FROTA: o sistema tinha caido e foi recuperado automaticamente.'
    Set-Content -Path $Estado -Value 'ok' -Encoding UTF8
} else {
    Registrar 'FALHA  recuperacao automatica nao resolveu - PRECISA DE ACAO MANUAL'
    Avisar 'NEXUS FROTA: SISTEMA FORA DO AR e a recuperacao automatica falhou. Abra o Docker Desktop e verifique.'
    Set-Content -Path $Estado -Value 'fora' -Encoding UTF8
}

# Poda do log (nunca crescer sem limite)
$item = Get-Item $Log
if ($item -and $item.Length -gt 1MB) {
    $ultimas = Get-Content $Log -Tail 500
    Set-Content -Path $Log -Value $ultimas -Encoding UTF8
}
