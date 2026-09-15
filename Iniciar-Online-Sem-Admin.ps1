param(
    [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsRoot = Join-Path $ScriptRoot "tools"
$CloudflaredPath = Join-Path $ToolsRoot "cloudflared.exe"
$CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$AppUrl = "http://localhost:$Port/"
$LogPath = Join-Path $ScriptRoot "cloudflared.log"
$ErrorLogPath = Join-Path $ScriptRoot "cloudflared.err.log"
$UrlPath = Join-Path $ScriptRoot "online-url.txt"

function Test-AppRunning {
    try {
        $response = Invoke-WebRequest -UseBasicParsing "$AppUrl/api/config" -TimeoutSec 5
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Ensure-Cloudflared {
    if (Test-Path -LiteralPath $CloudflaredPath) { return }

    if (-not (Test-Path -LiteralPath $ToolsRoot)) {
        New-Item -ItemType Directory -Path $ToolsRoot | Out-Null
    }

    Write-Host "Baixando cloudflared para a pasta do projeto..."
    $tempPath = "$CloudflaredPath.download"
    if (Test-Path -LiteralPath $tempPath) {
        Remove-Item -LiteralPath $tempPath -Force
    }

    Invoke-WebRequest -UseBasicParsing -Uri $CloudflaredUrl -OutFile $tempPath
    Move-Item -LiteralPath $tempPath -Destination $CloudflaredPath -Force
}

function Ensure-AppRunning {
    if (Test-AppRunning) { return }

    Write-Host "Iniciando CosturaFlow em $AppUrl"
    Start-Process powershell.exe `
        -WorkingDirectory $ScriptRoot `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptRoot\Start-App.ps1`" -Port $Port -HostName localhost" `
        -WindowStyle Hidden | Out-Null

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-AppRunning) { return }
    }

    throw "Nao foi possivel iniciar o app local em $AppUrl"
}

function Stop-OldTunnel {
    $processes = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*tunnel*" -and $_.CommandLine -like "*localhost:$Port*" }

    foreach ($process in @($processes)) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Ensure-Cloudflared
Ensure-AppRunning
Stop-OldTunnel

Remove-Item -LiteralPath $LogPath, $ErrorLogPath, $UrlPath -ErrorAction SilentlyContinue

Write-Host "Criando link publico temporario..."
$arguments = "tunnel --url $AppUrl --http-host-header localhost:$Port --no-autoupdate"
Start-Process $CloudflaredPath `
    -WorkingDirectory $ScriptRoot `
    -ArgumentList $arguments `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogPath `
    -RedirectStandardError $ErrorLogPath | Out-Null

$publicUrl = $null
for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    $log = ""
    if (Test-Path -LiteralPath $LogPath) {
        $log += Get-Content -Raw -LiteralPath $LogPath -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $ErrorLogPath) {
        $log += "`n" + (Get-Content -Raw -LiteralPath $ErrorLogPath -ErrorAction SilentlyContinue)
    }
    if ($log) {
        $match = [regex]::Match($log, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        if ($match.Success) {
            $publicUrl = $match.Value
            break
        }
    }
}

if (-not $publicUrl) {
    Write-Host "Nao encontrei o link publico no log. Conteudo do log:"
    if (Test-Path -LiteralPath $LogPath) {
        Get-Content -LiteralPath $LogPath | Select-Object -Last 40
    }
    if (Test-Path -LiteralPath $ErrorLogPath) {
        Get-Content -LiteralPath $ErrorLogPath | Select-Object -Last 40
    }
    throw "Falha ao criar o tunel publico."
}

[IO.File]::WriteAllText($UrlPath, $publicUrl, [Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "LINK ONLINE:"
Write-Host $publicUrl
Write-Host ""
Write-Host "Este link funciona enquanto este computador estiver ligado, conectado a internet, com acesso ao G: e com cloudflared em execucao."
Write-Host "O link tambem foi salvo em: $UrlPath"
