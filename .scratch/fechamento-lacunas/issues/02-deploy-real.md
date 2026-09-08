# 02 — Deploy real: frontend no Vercel + backend no Render

**What to build:** o AVIA acessível publicamente via HTTPS — frontend hospedado no Vercel, backend hospedado no Render, comunicando entre si em produção sem depender de IP local de rede doméstica.

**Blocked by:** None

**Status:** in-progress — repo preparado, execução guiada por wizard (`scripts/deploy-wizard.sh`)

## Preparado em 2026-09-08

- [x] Plataforma do backend decidida: **Render** (free tier sem cartão; trade-off aceito é o "sleep" após ociosidade).
- [x] CORS deixou de ser hardcoded em `main.py` — agora vem de `CORS_ALLOWED_ORIGINS` (`config.py`), lista separada por vírgula, configurável via variável de ambiente no provedor sem precisar editar código/redeployar.
- [x] `render.yaml` criado na raiz do repo (Render Blueprint) — `rootDir: backend`, build via `uv sync`, start via `uv run fastapi run --port $PORT`, com `OCR_SPACE_API_KEY`/`HUGGINGFACE_API_TOKEN` marcadas `sync: false` (Render pede o valor no dashboard, nunca vai pro repo).
- [x] Checado `frontend/.env`: a chave `VITE_API_BASE_URL` duplicada mencionada anteriormente não existe mais no arquivo atual — item já resolvido, não é mais pendência.
- [ ] Frontend publicado no Vercel, acessível via HTTPS.
- [ ] Backend publicado no Render, acessível via HTTPS.
- [ ] `VITE_API_BASE_URL` (Vercel) apontando para a URL do backend publicado.
- [ ] `CORS_ALLOWED_ORIGINS` (Render) atualizada com o domínio do Vercel.
- [ ] `OCR_SPACE_API_KEY` e `HUGGINGFACE_API_TOKEN` coladas no dashboard do Render.

---

## Nota: Docker, se necessário

**Não é pré-requisito deste ticket.** O Vercel serve o frontend como estático (não precisa de Docker em nenhum cenário) e Railway/Render constroem Python nativamente. Localmente, `uv run fastapi dev` já resolve — containerizar só adicionaria fricção de rebuild.

**Quando puxar essa carta:** se a plataforma tiver problema com o `uv` (é recente, e o suporte varia entre provedores). Aí o Docker vira a saída que torna o build determinístico.

Esboço — **não testado**, o entrypoint já está declarado no `pyproject.toml`, por isso o `fastapi run` funciona sem argumentos:

```dockerfile
FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY src/ ./src/
ENV PATH="/app/.venv/bin:$PATH"
CMD ["fastapi", "run"]
```

⚠️ Railway e Render injetam a porta pela variável `$PORT`. Na forma exec acima ela **não** é expandida — provavelmente vai precisar virar forma shell (`CMD fastapi run --port ${PORT:-8000}`) para o provedor conseguir rotear.

**Ganho secundário se acabar usando:** "o ambiente de execução está descrito pelo Dockerfile" é afirmação de reprodutibilidade legítima para os testes de desempenho (ticket 06) na monografia.
