$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = Join-Path $ScriptRoot "web"

Set-Location $WebRoot

if (-not (Test-Path (Join-Path $WebRoot "node_modules"))) {
    Write-Host "Instalando dependencias (primeira vez, pode levar um minuto)..."
    npm install
}

Write-Host ""
Write-Host "Abrindo http://localhost:5173/ no navegador..."
Write-Host "Deixe esta janela aberta enquanto estiver usando o formulario."
Write-Host "Feche a janela ou pressione Ctrl+C para encerrar."
Write-Host ""

Start-Process "http://localhost:5173/"
npm run dev
