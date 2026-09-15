<#
Gera links "qualquer pessoa com o link" para todos os vídeos da pasta do OneDrive
e salva num JSON (video-links.json) pronto para importar no Banco de Operações.

Não precisa de registro de aplicativo no Azure nem de administrador do Microsoft 365:
usa o modulo oficial "Microsoft Graph PowerShell" da própria Microsoft, autorizado com
o seu proprio login (delegado) na hora que voce roda o script.

Rode de novo sempre que subir vídeo novo na pasta.
#>

param(
    [string]$UsuarioOneDrive = "processos@upman.com.br",
    [string]$PastaVideos = "vídeos de produção",
    [string]$ArquivoSaida = (Join-Path $PSScriptRoot "..\video-links.json")
)

$ErrorActionPreference = "Stop"

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
    Write-Host "Instalando o modulo Microsoft Graph PowerShell (primeira vez)..."
    Install-Module Microsoft.Graph -Scope CurrentUser -Force -AllowClobber
}

Write-Host "Fazendo login (vai abrir o navegador)..."
Connect-MgGraph -Scopes "Files.Read.All" -NoWelcome

function Get-TodosOsArquivos {
    param([string]$CaminhoCodificado)

    $itens = @()
    $url = "https://graph.microsoft.com/v1.0/users/$UsuarioOneDrive/drive/root:/${CaminhoCodificado}:/children?`$select=id,name&`$top=200"
    while ($url) {
        $resposta = Invoke-MgGraphRequest -Method GET -Uri $url
        $itens += $resposta.value
        $url = $resposta["@odata.nextLink"]
    }
    return $itens
}

function New-LinkPublico {
    param([string]$ItemId)

    $url = "https://graph.microsoft.com/v1.0/users/$UsuarioOneDrive/drive/items/$ItemId/createLink"
    $corpo = @{ type = "view"; scope = "anonymous" } | ConvertTo-Json
    $resposta = Invoke-MgGraphRequest -Method POST -Uri $url -Body $corpo -ContentType "application/json"
    return $resposta.link.webUrl
}

function Get-CodigoDoArquivo {
    param([string]$Nome)
    if ($Nome -match "^\s*(\d{2,})") { return $Matches[1] }
    return $null
}

Write-Host "Listando arquivos em '$PastaVideos'..."
$caminhoCodificado = [Uri]::EscapeDataString($PastaVideos)
$arquivos = Get-TodosOsArquivos -CaminhoCodificado $caminhoCodificado
Write-Host "Encontrados $($arquivos.Count) arquivos. Gerando links publicos..."

$porCodigo = @{}
$total = $arquivos.Count
$i = 0
foreach ($arquivo in $arquivos) {
    $i++
    Write-Progress -Activity "Gerando links" -Status $arquivo.name -PercentComplete (($i / $total) * 100)

    $codigo = Get-CodigoDoArquivo -Nome $arquivo.name
    if (-not $codigo) { continue }

    $link = New-LinkPublico -ItemId $arquivo.id
    if (-not $porCodigo.ContainsKey($codigo)) { $porCodigo[$codigo] = @() }
    $porCodigo[$codigo] += [ordered]@{ arquivo = $arquivo.name; url = $link }
}

$resultado = $porCodigo.Keys | Sort-Object | ForEach-Object {
    [ordered]@{ codigo = $_; videos = $porCodigo[$_] }
}

$resultado | ConvertTo-Json -Depth 5 | Out-File -FilePath $ArquivoSaida -Encoding utf8
Write-Host ""
Write-Host "Pronto! $($resultado.Count) codigos com video salvos em: $ArquivoSaida"
Write-Host "Agora va em Banco de Operacoes > Importar videos e escolha esse arquivo."

Disconnect-MgGraph | Out-Null
