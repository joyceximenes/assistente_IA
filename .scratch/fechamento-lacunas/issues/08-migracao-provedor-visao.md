# 08 — Migração do provedor de visão: Google Vision → OCR.space + Hugging Face

**What to build:** substituir o Google Cloud Vision (exige cartão de crédito/billing, o que a Joyce decidiu não seguir) por dois provedores gratuitos sem cartão: OCR.space para texto e Hugging Face Inference API (`facebook/detr-resnet-50`) para objetos/labels.

**Blocked by:** None

**Status:** in-progress — código migrado e testado, faltam as chaves reais

## Feito em 2026-09-04

- [x] `src/services/vision_google.py` removido; `src/services/vision_free.py` criado, combinando OCR.space + Hugging Face no mesmo formato que `decision.py` já esperava (nenhuma mudança na lógica de decisão texto/objeto).
- [x] `pyproject.toml`: removidas `google-cloud-vision`/`google-api-core`; `httpx` adicionada como dependência direta.
- [x] `config.py`: `google_project_id` trocado por `ocr_space_api_key` + `huggingface_api_token`.
- [x] `routes.py`, `schemas.py`, `image_io.py`, `README.md`: referências ao Google Vision atualizadas.
- [x] Testes reescritos (`tests/test_vision_free.py`) e `tests/test_routes.py` ajustado — 81 testes + `ruff check` passando, sem tocar API real.
- [x] Bug lateral corrigido: `backend/.env` nunca era carregado (`fastapi dev` não chama `load_dotenv()` sozinho) — `config.py` agora chama `load_dotenv()` e `python-dotenv` virou dependência direta. Antes disso, nenhuma variável do `.env` valia de fato, nem no tempo do Google Vision.

## Pendente

- [ ] Gerar chave grátis do OCR.space (ocr.space/ocrapi/freekey — instantânea, sem cartão) e colar em `backend/.env` como `OCR_SPACE_API_KEY`.
- [ ] Gerar token grátis da Hugging Face (huggingface.co/settings/tokens, tipo "Read", sem cartão) e colar em `backend/.env` como `HUGGINGFACE_API_TOKEN`.
- [ ] Rodar o teste ponta a ponta real (como foi feito com o Google Vision antes de travar no billing) para confirmar que as duas APIs respondem como esperado.
- [ ] Decidir o que fazer com a service account real do Google Cloud criada durante a tentativa anterior e com o mock `backend/credentials/service-account.json` — nenhum dos dois é mais usado pelo código; podem ser removidos/a service account deletada no console.
- [ ] Ficar de olho no cold start do Hugging Face free tier (primeira chamada ao modelo pode responder 503 por alguns segundos) — já tratado como erro de domínio com mensagem clara, mas pode exigir um retry manual na primeira análise depois de um tempo ocioso.
