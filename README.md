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
    services/     pré-processamento de imagem, Google Vision, regra de decisão
  pyproject.toml  dependências e entrypoint da CLI do FastAPI
frontend/         PWA React + TypeScript + Vite
  src/
    routes/       telas (Home, Camera, Result)
    services/     api, guidance de captura, voz e feedback háptico
```

## Pré-requisitos

- [uv](https://docs.astral.sh/uv/) para o backend (Python ≥ 3.11)
- Node.js para o frontend
- Credenciais do Google Cloud Vision em `backend/credentials/service-account.json`

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
3. Libere esse endereço no CORS, em `backend/src/main.py`.

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

## Configuração

**`backend/.env`**

| Variável | Padrão | Descrição |
|---|---|---|
| `ENV` | `dev` | Ambiente |
| `GOOGLE_PROJECT_ID` | — | Projeto no Google Cloud |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Caminho do JSON da service account |
| `MAX_UPLOAD_BYTES` | `5000000` | Tamanho máximo do upload (5 MB) |
| `MAX_IMAGE_SIDE_PX` | `1280` | Maior lado após o redimensionamento |
| `RETURN_RAW_PROVIDER_RESPONSE` | `false` | Inclui a resposta crua do Vision (debug) |

**`frontend/.env`**

| Variável | Descrição |
|---|---|
| `VITE_API_BASE_URL` | URL base da API. Só pode haver **uma** linha ativa. |

## API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/analyze` | Recebe uma imagem (campo `image`, multipart) e devolve o texto ou os objetos reconhecidos |
