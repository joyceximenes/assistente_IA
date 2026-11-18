# Project Map

Mapa baseado no que foi inspecionado em 16/10/2026. "Inferido" = deduzido de nomes de arquivo, descrições ou commits, sem abrir o arquivo.

## Purpose
AVIA: PWA que ajuda pessoas com baixa visão a ler textos/rótulos e identificar objetos pela câmera, falando o resultado por voz. TCC de graduação (MVP, não produção).

## Requirements
- Exige conexão (modo offline foi descartado).
- Respostas por voz curtas e acessíveis; orientação de enquadramento antes da captura (desfoque, brilho, distância).
- Avaliação quantitativa do TCC focada na orientação (VizWiz); reconhecimento fica só nos testes manuais.

## Components
- `frontend/` — React 18 + Vite + TypeScript, testes com vitest, lint com Biome.
  - `src/app.tsx`, `src/routes/{Home,Camera,Result}.tsx` — telas.
  - `src/services/guidance.ts` — pontuações de qualidade do frame (blurScore, edgeScore, brightnessScore, overexposedRatio; colunas vistas no CSV).
  - `src/services/{api,voice,haptics,sound}.ts` — chamada ao backend, voz, vibração, som (responsabilidades inferidas dos nomes).
  - `scripts/{extract-guidance-scores.mjs,guidance-harness.html,guidance-harness.ts}` — rodam o `guidance.ts` real sobre o dataset (Playwright em Chrome sem janela, segundo o cartão s4c).
- `backend/` — FastAPI (Python ≥ 3.11, uv).
  - `src/main.py` — monta o app e o CORS.
  - `src/api/routes.py` — `GET /health` e `POST /analyze` (verificado).
  - `src/services/image_io.py` — valida tamanho e normaliza a imagem para JPEG.
  - `src/services/vision_free.py` — OCR.space (texto) + Hugging Face (objetos).
  - `src/services/decision.py` — decide texto vs. objeto vs. desconhecido.
  - `src/core/config.py` — configurações por variável de ambiente.
- `analysis/` — projeto uv separado (declara só pandas), `data/guidance_scores.csv` e `notebooks/` com `baseline.ipynb` e `calibration.ipynb` (versionados em 22/10/2026, commit `9d91716`, cópias do Kaggle sem saídas salvas) e `kappa_fleiss.ipynb` (local, fora do git). A versão canônica está no Kaggle (`joyceximenes/baseline`, público, e `joyceximenes/calibration`, privado; editados via CLI kaggle); o repo pode ficar atrás deles.
- `scripts/build_manifest.py` gera `DATASET/manifest.csv`; `scripts/deploy-wizard.sh` guia o deploy.
- `DATASET/` — imagens e anotações brutas do VizWiz ficam fora do git; só `manifest.csv` é versionado.
- `render.yaml` — Blueprint do backend no Render.

## Main Flow
Uso no app:
Camera.tsx --frames--> guidance.ts --mensagem de orientação--> voz/háptico
Camera.tsx --captura--> api.ts --POST /analyze (multipart)--> routes.py --> image_io (valida, normaliza) --> vision_free (OCR.space + Hugging Face) --> decision.py --> JSON --> Result.tsx --> voice.ts (?)

Análise offline (Sprint 4):
DATASET/images --> harness (guidance.ts em Chrome sem janela) --> guidance_scores.csv --> baseline.ipynb (tabela-resumo `summary` → seção final de bootstrap, tabela `ci` com IC 95% de precisão, revocação e AUC; s4e)
DATASET/annotations_desafio/val.json --> contagem de votos (0–5) por categoria e imagem --> `analysis/notebooks/kappa_fleiss.ipynb` (em construção pela usuária; passo 1 feito: contagens de "sim" por categoria): acordo por pares → observado → esperado → kappa de Fleiss para BLR, BRT, DRK e FRM, mostrado com % de acordo e prevalência. Acesso ao val.json: em aberto.

## Data and Trust Boundaries
- Não há banco de dados no app. As imagens saem do celular para o backend e daí para dois serviços de terceiros (OCR.space e Hugging Face).
- Chaves (`OCR_SPACE_API_KEY`, `HUGGINGFACE_API_TOKEN`) ficam em `backend/.env` (ignorado pelo git) e no painel do Render (`sync: false`).
- CORS vem de `CORS_ALLOWED_ORIGINS`; no `render.yaml` o valor ainda lista só origens localhost.

## Build and Deployment
- Backend: `uv run poe test`, `uv run poe lint`, `fastapi dev` / `fastapi run` a partir de `backend/` (`pyproject.toml`).
- Frontend: `npm run dev | build | test | lint` (`package.json`).
- Deploy: backend no Render via `render.yaml`; frontend no Vercel, segundo o ticket 02 (sem arquivo de configuração do Vercel visto). O ticket 02 está em andamento.

## Unknowns
- Internos de `app.tsx`, `Camera.tsx`, `voice.ts` e `decision.py` (não lidos nesta inspeção).
- Se o deploy no Render e no Vercel já foi concluído.
- Onde um futuro classificador (Sprint 5) rodaria; nada decidido.
