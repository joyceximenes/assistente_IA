# 01 — Corrigir bugs de interação conhecidos

**What to build:** o reconhecimento de voz para instantaneamente quando o usuário sai da tela (Home ou Result) no meio de uma escuta, em vez de continuar ativo até o timeout; o código morto de tratamento de erro em `app.tsx` é removido ou justificado; a linha da planilha de testes sobre o overlay de análise é corrigida para bater com o comportamento real do código.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `listenOnce()` (usado em `Home.tsx` e `Result.tsx`) para o `SpeechRecognition` ativo assim que o componente chamador desmonta, sem esperar o timeout de 5-6s.
- [ ] Bloco `catch` de `handleCaptured` em `app.tsx` removido (já que `api.ts` trata erro de rede internamente) ou mantido com justificativa documentada se alguma análise mostrar que ainda é alcançável.
- [ ] Linha "Overlay Analisando durante isAnalyzing=true" no `TESTES.xlsx` reexecutada: data futura corrigida e observação atualizada pra refletir o comportamento real verificado no código (o `finally` em `handleCaptured` já desliga o overlay).
