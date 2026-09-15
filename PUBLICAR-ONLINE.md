# Publicacao online do CosturaFlow

O app le arquivos internos em `G:\Ficha Técnica` e videos em `G:\Métodos e Processos\Método em vídeo\VÍDEOS BDF`. Para acessar fora da empresa, o servidor precisa continuar rodando em uma maquina que tenha acesso a essas pastas e precisa ser publicado por uma camada segura.

## Opcoes recomendadas

0. Link temporario sem Administrador

   Execute:

   ```powershell
   .\Iniciar-Online-Sem-Admin.ps1
   ```

   O script usa Cloudflare Quick Tunnel para gerar um link publico temporario `https://...trycloudflare.com` apontando para `http://localhost:8787/`. Nao precisa de senha de Administrador, firewall ou redirecionamento de porta.

1. VPN corporativa

   O celular entra na VPN da empresa e acessa o endereco interno do computador ou servidor que roda o app.

2. Tunel seguro com autenticacao

   Um tunel HTTPS aponta para `http://localhost:8787/` no computador/servidor da empresa. Recomenda-se usar autenticacao, por exemplo login corporativo, antes de liberar os videos.

3. Servidor interno publicado pela TI

   A TI hospeda o app em uma maquina/VM com acesso ao `G:` e publica um dominio HTTPS, como `https://videos.suaempresa.com.br`.

## O que nao e recomendado

Nao recomendo abrir diretamente a porta `8787` no roteador para a internet, porque isso exporia fichas tecnicas e videos internos sem uma camada adequada de seguranca.

## Rede local

Para acessar pelo celular dentro da empresa, execute uma vez como Administrador:

```powershell
.\Liberar-Rede-Local.ps1
```

Depois reinicie:

```powershell
.\Start-App.ps1
```

O terminal mostrara os enderecos `http://IP-DO-COMPUTADOR:8787/` disponiveis para celulares na mesma rede.
