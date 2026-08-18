# 02 — Deploy real: frontend no Vercel + backend no Railway/Render

**What to build:** o AVIA acessível publicamente via HTTPS — frontend hospedado no Vercel, backend hospedado no Railway ou Render, comunicando entre si em produção sem depender de IP local de rede doméstica.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Frontend publicado no Vercel, acessível via HTTPS.
- [ ] Backend publicado no Railway ou Render, acessível via HTTPS.
- [ ] CORS do backend liberando o domínio de produção do frontend (além de manter localhost para desenvolvimento).
- [ ] `frontend/.env` de produção aponta para a URL do backend publicado; chave `VITE_API_BASE_URL` duplicada removida.
- [ ] Credenciais do Google Vision configuradas como variável de ambiente no provedor do backend (nunca commitadas no repositório).

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
