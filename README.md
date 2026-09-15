# CosturaFlow

Aplicativo web local para navegar pelas fichas tecnicas em Excel e assistir aos videos das operacoes de costura.

> **Nova versao em construcao:** a pasta [`web/`](./web) tem o comeco do CosturaFlow 2.0 (ficha criada direto no site, sem Excel). Para abrir, rode `.\Start-Web.ps1` ou veja [`web/README.md`](./web/README.md). Este README abaixo continua valendo para o app atual, que segue rodando normalmente.

## Como iniciar

Abra o PowerShell nesta pasta e execute:

```powershell
.\Start-App.ps1
```

Depois acesse no computador:

```text
http://localhost:8787/
```

O servidor inicia aceitando conexoes de outros dispositivos da rede. Para usar pelo celular dentro da empresa, abra o endereco informado no terminal como:

```text
http://IP-DO-COMPUTADOR:8787/
```

Para acessar fora da empresa, este app precisa ser publicado por uma solucao segura, como VPN corporativa, tunel seguro ou servidor HTTPS com autenticacao. Somente iniciar o app no computador nao torna o endereco acessivel pela internet.

Veja tambem [PUBLICAR-ONLINE.md](./PUBLICAR-ONLINE.md).

Para criar um link online temporario sem senha de Administrador:

```powershell
.\Iniciar-Online-Sem-Admin.ps1
```

O script baixa `cloudflared.exe` na pasta `tools`, inicia o app local e mostra um link `https://...trycloudflare.com`.

Se o Windows bloquear o acesso por outros aparelhos na rede local, execute uma vez como Administrador:

```powershell
.\Liberar-Rede-Local.ps1
```

## Pastas configuradas

- Fichas tecnicas: `G:\Ficha Técnica`
- Videos: `G:\Métodos e Processos\Método em vídeo\VÍDEOS BDF`

## Leitura da planilha

O app procura somente a aba com este nome exato:

- `ROTEIRO DE PRODUÇÃO 15-05`

Nao ha fallback para variacoes, abreviacoes, nomes sem data ou nomes com simbolos extras.

Arquivos Excel sem essa aba exata nao aparecem na tela e nao entram na busca.

Colunas usadas:

- Codigo: `B`, com fallback para `C`
- Descricao: `F`
- Observacao: `R`
- Tempo: `U`

O video e associado quando o nome do arquivo comeca pelo codigo da operacao, por exemplo:

```text
10513 - FAZER BAINHA DE PERNAS (30 - 40 CM).mp4
```
