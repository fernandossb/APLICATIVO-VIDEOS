param(
    [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).
    IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    throw "Execute este script como Administrador."
}

$everyone = ([Security.Principal.SecurityIdentifier]"S-1-1-0").Translate([Security.Principal.NTAccount]).Value
$url = "http://+:$Port/"

Write-Host "Liberando URL HTTP: $url para $everyone"
& netsh http delete urlacl url=$url 2>$null | Out-Null
& netsh http add urlacl url=$url user="$everyone" | Out-Host

$ruleName = "CosturaFlow $Port"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
    Remove-NetFirewallRule -DisplayName $ruleName
}

Write-Host "Liberando firewall TCP na porta $Port"
New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Any | Out-Host

Write-Host ""
Write-Host "Liberacao concluida. Reinicie o aplicativo com:"
Write-Host ".\Start-App.ps1 -Port $Port"
