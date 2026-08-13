# 02 — Deploy real: frontend no Vercel + backend no Railway/Render

**What to build:** o AVIA acessível publicamente via HTTPS — frontend hospedado no Vercel, backend hospedado no Railway ou Render, comunicando entre si em produção sem depender de IP local de rede doméstica.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Frontend publicado no Vercel, acessível via HTTPS.
- [ ] Backend publicado no Railway ou Render, acessível via HTTPS.
- [ ] CORS do backend liberando o domínio de produção do frontend (além de manter localhost para desenvolvimento).
- [ ] `frontend/.env` de produção aponta para a URL do backend publicado; chave `VITE_API_BASE_URL` duplicada removida.
- [ ] Credenciais do Google Vision configuradas como variável de ambiente no provedor do backend (nunca commitadas no repositório).
