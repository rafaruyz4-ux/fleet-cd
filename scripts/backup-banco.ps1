# Backup do banco de producao do NEXUS FROTA (fleet-cd)
# Gera um dump completo do Postgres do container de producao e guarda no OneDrive
# (CEREBRO RAFAEL\PROJETOS\Fleet-CD\backups), que sincroniza pra nuvem = copia off-site.
# Agendado no Task Scheduler do Windows (tarefa "NexusFrota-BackupBanco", a cada 4h).
# ATENCAO: manter este arquivo 100% ASCII (sem acento/travessao) - o PowerShell 5.1
# le .ps1 sem BOM como ANSI e caracteres especiais quebram o parse.

$ErrorActionPreference = 'Stop'

$Container = 'fleet-cd-prod-postgres-1'
$DbUser    = 'fleet'
$DbName    = 'fleet_cd'
$Destino   = 'C:\Users\mdena\OneDrive - Nexus Orbital\CEREBRO RAFAEL\PROJETOS\Fleet-CD\backups'
$Docker    = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$RetencaoDias = 14      # apaga dumps mais velhos que isso...
$MinimoManter = 10      # ...mas nunca deixa menos que N dumps na pasta
$TamanhoMinimoKB = 20   # dump menor que isso = algo errado, nao conta como sucesso

$Log = Join-Path $Destino 'backup-log.txt'
function Registrar($msg) {
    $linha = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $Log -Value $linha -Encoding UTF8
}

try {
    if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Force $Destino | Out-Null }

    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
    $arquivo = 'fleet_cd_' + $stamp + '.dump'
    $caminhoFinal = Join-Path $Destino $arquivo

    # pg_dump escreve DENTRO do container e depois copiamos com docker cp.
    # (Redirecionar a saida binaria direto pelo PowerShell corrompe o arquivo.)
    & $Docker exec $Container pg_dump -U $DbUser -Fc --no-owner -f /tmp/backup.dump $DbName
    if ($LASTEXITCODE -ne 0) { throw ('pg_dump falhou (exit ' + $LASTEXITCODE + ')') }

    & $Docker cp ($Container + ':/tmp/backup.dump') $caminhoFinal
    if ($LASTEXITCODE -ne 0) { throw ('docker cp falhou (exit ' + $LASTEXITCODE + ')') }
    & $Docker exec $Container rm -f /tmp/backup.dump | Out-Null

    $kb = [math]::Round((Get-Item $caminhoFinal).Length / 1KB, 1)
    if ($kb -lt $TamanhoMinimoKB) { throw ('dump suspeito de vazio (' + $kb + ' KB) - backup NAO conta') }

    # Retencao: apaga dumps velhos, mas sempre mantem os N mais recentes
    $dumps = Get-ChildItem $Destino -Filter 'fleet_cd_*.dump' | Sort-Object LastWriteTime -Descending
    $limite = (Get-Date).AddDays(-$RetencaoDias)
    $apagados = 0
    if ($dumps.Count -gt $MinimoManter) {
        $dumps | Select-Object -Skip $MinimoManter | Where-Object { $_.LastWriteTime -lt $limite } | ForEach-Object {
            Remove-Item $_.FullName -Force
            $apagados++
        }
    }

    $sufixo = ''
    if ($apagados -gt 0) { $sufixo = ', ' + $apagados + ' antigo(s) apagado(s)' }
    Registrar ('OK  ' + $arquivo + ' (' + $kb + ' KB)' + $sufixo)
    exit 0
}
catch {
    Registrar ('ERRO  ' + $_.Exception.Message)
    exit 1
}
