# 08 — Migração do provedor de visão: Google Vision → OCR.space + Hugging Face

**What to build:** substituir o Google Cloud Vision (exige cartão de crédito/billing, o que a Joyce decidiu não seguir) por dois provedores gratuitos sem cartão: OCR.space para texto e Hugging Face Inference API (`facebook/detr-resnet-50`) para objetos/labels.

**Blocked by:** None

**Status:** done — código migrado, chaves reais configuradas, testado ponta a ponta

## Feito em 2026-09-04

- [x] `src/services/vision_google.py` removido; `src/services/vision_free.py` criado, combinando OCR.space + Hugging Face no mesmo formato que `decision.py` já esperava (nenhuma mudança na lógica de decisão texto/objeto).
- [x] `pyproject.toml`: removidas `google-cloud-vision`/`google-api-core`; `httpx` adicionada como dependência direta.
- [x] `config.py`: `google_project_id` trocado por `ocr_space_api_key` + `huggingface_api_token`.
- [x] `routes.py`, `schemas.py`, `image_io.py`, `README.md`: referências ao Google Vision atualizadas.
- [x] Testes reescritos (`tests/test_vision_free.py`) e `tests/test_routes.py` ajustado — 81 testes + `ruff check` passando, sem tocar API real.
- [x] Bug lateral corrigido: `backend/.env` nunca era carregado (`fastapi dev` não chama `load_dotenv()` sozinho) — `config.py` agora chama `load_dotenv()` e `python-dotenv` virou dependência direta. Antes disso, nenhuma variável do `.env` valia de fato, nem no tempo do Google Vision.
- [x] Chaves reais geradas e coladas em `backend/.env` (OCR_SPACE_API_KEY, HUGGINGFACE_API_TOKEN).
- [x] **Bug descoberto e corrigido no teste real**: a URL da Hugging Face usada (`api-inference.huggingface.co`) estava descontinuada — a API migrou para `router.huggingface.co/hf-inference/models/...`. Faltava também o header `Content-Type: image/jpeg`, sem o qual a API rejeitava com 400.
- [x] Teste ponta a ponta com as APIs reais: OCR.space leu texto corretamente; Hugging Face detectou pessoa (99.9%), ônibus (99.9%), hidrante etc. em foto real — pipeline completo validado.
- [x] Resquícios do Google Vision removidos: pasta `backend/credentials/` (não usada mais) e regras correspondentes do `.gitignore`; comentários em `decision.py`, `test_decision.py`, `test_image_io.py`, `test_routes.py` que ainda citavam o Vision como provedor atual.
- [x] Service account real do Google Cloud (`avia-111@project-063f070b-d0d1-4ea3-8b2.iam.gserviceaccount.com`) deletada via `gcloud` — nunca chegou a ter billing ativo, sem custo associado.
- [x] Commits `abf9968` e `d17fa31` enviados para `origin/main`.

## Pendente

- [ ] Ficar de olho no cold start do Hugging Face free tier (primeira chamada ao modelo pode responder 503 por alguns segundos depois de um tempo ocioso) — já tratado como erro de domínio com mensagem clara.
