# AVIA — Assistente Visual Acessível

PWA que ajuda pessoas cegas ou com baixa visão a ler textos e identificar objetos
pela câmera do celular, com orientação por voz em tempo real durante a captura.

TCC de Engenharia da Computação — UFC Sobral.

## Estrutura

```
backend/          API FastAPI (Python) — gerenciada com uv
  src/
    api/          rotas, schemas Pydantic e helpers de erro
    core/         configuração (env) e logging
    services/     pré-processamento de imagem, provedores de visão (OCR.space + Hugging Face), regra de decisão
  pyproject.toml  dependências e entrypoint da CLI do FastAPI
frontend/         PWA React + TypeScript + Vite
  src/
    routes/       telas (Home, Camera, Result)
    services/     api, guidance de captura, voz e feedback háptico
```

## Pré-requisitos

- [uv](https://docs.astral.sh/uv/) para o backend (Python ≥ 3.11)
- Node.js para o frontend
- Chaves grátis do OCR.space e da Hugging Face Inference API (veja `backend/.env`)

## Rodando em desenvolvimento

São dois processos, em dois terminais.

**Backend** (dentro de `backend/`):

```bash
uv run fastapi dev --host 0.0.0.0
```

O `uv` cria e sincroniza o ambiente virtual automaticamente na primeira execução.
O entrypoint (`src.main:app`) já está declarado no `pyproject.toml`, então não é
preciso passar o caminho do arquivo. A API sobe em `http://localhost:8000`, com
documentação interativa em `/docs`.

> No console do Windows, os emojis da CLI aparecem truncados (`ÔÜí´©Å`). É apenas
> cosmético. Para corrigir, defina `PYTHONIOENCODING=utf-8` no ambiente.

**Frontend** (dentro de `frontend/`):

```bash
npm install   # apenas na primeira vez
npm run dev
```

Sobe em `http://localhost:5173`. O `--host` já está no script, então o endereço
de rede aparece no terminal — use-o para abrir no celular.

### Testando no celular

1. Confira o IP da máquina na rede local (`ipconfig` no Windows).
2. Ajuste `VITE_API_BASE_URL` em `frontend/.env` para esse IP.
3. Libere esse endereço em `CORS_ALLOWED_ORIGINS`, em `backend/.env`.

> Instalar a PWA e usar a câmera exige HTTPS — em `http://` de rede local o
> navegador bloqueia. Isso só funciona plenamente após o deploy.

## Rodando em produção

Backend (dentro de `backend/`):

```bash
uv run fastapi run
```

Frontend (dentro de `frontend/`):

```bash
npm run build   # gera dist/
```

## Deploy

Frontend no Vercel (estático), backend no Render (Blueprint em `render.yaml`
na raiz do repo). Roteiro guiado passo a passo:

```bash
./scripts/deploy-wizard.sh
```

O script abre os dashboards certos, diz exatamente o que clicar/colar, e
guarda as URLs resultantes em `frontend/.env`. Pode parar com Ctrl-C e rodar
de novo depois — ele lembra o que já foi preenchido.

## Testes

Nenhum teste chama o OCR.space ou a Hugging Face de verdade — as APIs externas
são substituídas por um dublê. Não é preciso chave nem internet para rodar a suíte.

**Backend** (dentro de `backend/`):

```bash
uv run poe test       # pytest -v, lista teste por teste
uv run poe coverage   # cobertura, com as linhas não executadas na coluna Missing
uv run poe lint       # ruff
```

As tarefas estão em `[tool.poe.tasks]` no `pyproject.toml`. Também dá para
chamar o pytest direto — `uv run pytest tests/test_decision.py` para rodar só um
arquivo, ou `-k nome_do_teste` para filtrar por nome.

A coluna `Missing` do relatório de cobertura traz as linhas que nenhum teste
executou. Ela aponta o que ainda não foi olhado, não a qualidade do que já
existe: linha executada não é linha verificada.

**Frontend** (dentro de `frontend/`):

```bash
npm test            # vitest, uma passada
npm run test:watch  # re-roda ao salvar
npm run test:coverage
npm run lint        # biome
```

Os testes do frontend fixam `VITE_API_BASE_URL` em vez de ler o `.env`, que
localmente aponta para o IP da máquina na rede — assim a suíte vale em qualquer
máquina e na CI.

`Camera.tsx` e `Home.tsx` ficam fora da cobertura: dependem de `getUserMedia`,
que o jsdom não implementa. São caso para teste em dispositivo real.

## Configuração

**`backend/.env`**

| Variável | Padrão | Descrição |
|---|---|---|
| `ENV` | `dev` | Ambiente |
| `OCR_SPACE_API_KEY` | — | Chave grátis do OCR.space (ocr.space/ocrapi/freekey) |
| `HUGGINGFACE_API_TOKEN` | — | Token grátis da Hugging Face (huggingface.co/settings/tokens) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origens liberadas no CORS, separadas por vírgula. Em produção, inclua o domínio do frontend publicado |
| `MAX_UPLOAD_BYTES` | `5000000` | Tamanho máximo do upload (5 MB) |
| `MAX_IMAGE_SIDE_PX` | `1280` | Maior lado após o redimensionamento |
| `RETURN_RAW_PROVIDER_RESPONSE` | `false` | Inclui a resposta crua dos provedores (debug) |

**`frontend/.env`**

| Variável | Descrição |
|---|---|
| `VITE_API_BASE_URL` | URL base da API. Só pode haver **uma** linha ativa. |

## API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/analyze` | Recebe uma imagem (campo `image`, multipart) e devolve o texto ou os objetos reconhecidos |
