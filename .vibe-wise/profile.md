# Learner Profile

Learning mode: active
Onboarding: complete

Setup parcialmente pulado a pedido da usuária (16/10/2026): objetivo não especificado; preferências em padrão.

## Project
Situation: Existing (repositório com histórico de commits e sessões anteriores; a usuária não escolheu a opção no seletor)
Building: AVIA — assistente visual PWA para pessoas com baixa visão (TCC de graduação, defesa em 15/12/2026)
Codebase familiarity: Know it well (autodeclarado)
Learning scope: mixed

## Experience
Overall programming: Intermediate (autodeclarado)
Stack familiarity: Intermediate (autodeclarado, geral; sem detalhe por tecnologia)

## Goals
Primary: Not specified
Capability goal: Not specified

## Preferences
Checkpoint frequency: Normal
Question style: Open-ended
Explanation pace: uma ideia por vez, com um exemplo pequeno; sem tabela nem várias ideias juntas (pedido em 21/10/2026, "muita informação, vamos por partes"; já visto em 19/10 com o bootstrap)
Visual: sempre incluir um exemplo mais visual (desenho, fluxo em caixas, grade colorida ou analogia do dia a dia) junto do texto; pedido em 28/10/2026 depois de mostrar as anotações dela (`AVIA-TCC/classificador multirotulo.md`: frases curtas, dúvidas no meio, imagens coladas, analogia do sommelier, fluxo ASCII)
Sources: para conceitos novos de ML, quer uma aula em partes e fontes para estudar por conta própria (pedido em 27/10/2026, s5c)
Implementation style: A mix — no kappa (16/10/2026) a usuária pediu "vamos fazer juntos, você me guia": ela escreve o código e Claude guia e revisa; no s5c (03/11/2026), para o script de redução das imagens, escolheu "você escreve e explica" (Claude escreve e explica depois), e para o notebook de extração de features escolheu "eu escrevo; você guia e revisa" (ela escreve as células no Kaggle; Claude guia, revisa e roda)

## Strong Concepts
- Trade-off precisão × revocação e custo-benefício de mover um corte (21–22/10/2026): julgou por custo-benefício, defendeu a prioridade com motivo de produto e chegou sozinha a "equilibrar com a precisão como desempate" (F-beta).
- Ler a curva de precisão-revocação contra uma meta (viu que o teto do BLR ficava em ~77%, o real é ~76%).
- Escrever a fórmula do F0,5 sobre as listas da curva, achar o melhor ponto e converter o limiar de volta.

- Regressão logística sobre a lista da rede (28/10/2026): explicou com as próprias palavras que a regressão usa as features vindas da rede para estimar a chance de uma foto ser escura. Ainda separa mal rótulo (gabarito) de feature (número da lista) e os dois momentos (aprender e aplicar).

## Developing Concepts
- Ordem gabarito × palpite nas métricas do sklearn: trocou `y_true` e `y_pred` uma vez; corrigiu ao ser perguntada.
- Higiene de nomes: reaproveitou variáveis do BLR no DRK e sobrescreveu `recall_*` em 3 ocasiões; roda sem erro e imprime número de outra categoria. No s6a (07/11), chamou de `fn_blr` a contagem de falsos alarmes (FP) e deixou "falsos positivos" no `print` dos não detectados.
- Siglas FP/FN × falso alarme/não detectado (07/11): sabe a ideia em palavras; trocou a sigla FN por FP ao nomear.
- Ler um número contra os dois limites do IC: errou "dentro/acima/abaixo" no DRK e no BRT, e refez depois da conferência.
- Rede neural, camada, peso, score e regressão (27/10/2026): entendeu o fluxo do s5c, mas as definições estavam vagas para ela; trocou quem tem os pesos (disse que eram dados às fotos e que a rede foi pré-treinada em cima do VizWiz). Aula em partes em andamento.
- Corte × score: tendeu a concluir "só ajustar o corte, sem mudar o modelo" a partir do s5a (provado só para o corte).
- Papel de treino × validação num modelo que aprende (03/11/2026, s5c): disse que os pesos são aleatórios e depois que mudam com as fotos de validação até a saída bater com "o score da validação"; o plano dela no vault diz o contrário (treino ajusta, validação mede) e o alvo do ajuste é o rótulo humano. Explicado direto em 03/11; depois de quatro tentativas (a última, com os fatos dos três conjuntos), ela acertou: ajuste com o treino, prova na validação. Não disse o porquê; falta ela explicar a razão com as palavras dela.

## Revisit
- Bootstrap: reamostrar com reposição × embaralhar (19/10), ainda sem confirmação de que entendeu.
- Kappa e o paradoxo do kappa (16/10), ainda sem aplicar sozinha.

## Registro de competências
Formato do combinado de mentoria de 06/11/2026. Níveis: 1 Estudado · 2 Aplicado com orientação · 3 Aplicado autonomamente · 4 Demonstrado (explica, defende, valida e aplica em situação diferente). Rascunho conservador de 06/11/2026, só com o que tem evidência no vault (`6. Anotações para o artigo.md`, "Quem escreveu o quê") e neste perfil; a Joyce revisa antes de qualquer uso em currículo ou portfólio. Atualizar a cada entrega relevante, sem atribuir o que ela não demonstrou.

- **CI no GitHub Actions (s3d, 07/10):** nível 2. Evidência: `.github/workflows/backend.yml` e `frontend.yml`; última execução verde em 23/10. Escrito com orientação; ela explicou o propósito com as próprias palavras.
- **Linha de base com métricas (s4a, 12/10):** nível 2. Evidência: notebook `joyceximenes/baseline`. Escreveu o `BLR` (matriz, precisão, revocação, ROC/AUC, P×R/AP); trocou `y_true`/`y_pred` e reaproveitou nomes de variáveis, e corrigiu quando perguntada. `DRK`, `BRT` e `FRM` foram escritos pelo Claude a pedido dela.
- **Concordância entre anotadores, kappa de Fleiss (s4d, 16/10):** implementação nível 2; conceito nível 2 (precisou de uma segunda explicação). Evidência: `kappa_fleiss.ipynb` (fora do git). Leu o `val.json`, chegou à contagem correta de pares que discordam (`y(5 − y)/2`) e calculou o κ do `BLR` (0,42). A função final e a tabela das quatro categorias são do Claude.
- **Calibração de limiar com F0,5 (s5a, 22/10):** interpretação nível 3 (julgou por custo-benefício, chegou sozinha à ideia do F-beta e escreveu a fórmula do F0,5 sobre as listas da curva); código nível 2 (o passo a passo do `BLR` é dela; `calibrar_corte` é do Claude). Evidência: notebook `calibration`; corte do claro demais de 0,15 para 0,22 no `guidance.ts` (commit `74ef605`).
- **Bootstrap e intervalo de confiança (s4e, 19/10):** nível 1. As escolhas foram dela (quais métricas, sem AP, no Kaggle); o código foi do Claude. Sem confirmação de que entendeu (ver "Revisit").
- **Primeiro classificador, rede congelada + regressão logística (s5c, 05/11):** implementação nível 2 (extração: etapas 1 a 3 e a peça A; regressão: passos 1 a 6 e 8; o resto é do Claude); conceito nível 1 a 2 (explicou o papel da regressão com as próprias palavras; ainda confundia rótulo × feature e quem tem os pesos; acertou treino × validação depois de quatro tentativas). Evidência: notebooks `extracao-features-mobilenetv3-large` e `regressao-logistica-features` no Kaggle e os resultados do `s5c`. **Usou uma rede pré-treinada como extrator; não treinou nem ajustou rede neural.**
- **Comparação e análise de erro, heurística × modelo (s6a, 07/11):** decisão e enquadramento nível 3 (definiu sozinha o critério de produto, menos alarmes falsos porque frustram a experiência, o enquadramento como PoC e o recorte sem análise de causa, com razão de prazo); código nível 2 (escreveu a contagem FP/FN da heurística no `BLR` depois de dizer "não sei" e de um exemplo de 6 fotos; nomeou `fn_blr` o que era FP e corrigiu quando apontado). Contagem dos 4 rótulos, figuras, conclusão e o dataset do CSV: Claude, a pedido. Evidência: notebook `regressao-logistica-features` (seção 5, versão 35), `analysis/figures/s6a/`, vault seção 11.
