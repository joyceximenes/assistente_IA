import React, { useEffect, useRef, useState } from "react";
import type { AnalyzeResponse } from "../app";
import {
  isSpeechRecognitionSupported,
  listenOnce,
  speakAsync,
  stopSpeaking,
} from "../services/voice";
import { vibrateResult, vibrateError } from "../services/haptics";

// recebe as props o resultado da análise e funções para retry e home
type Props = {
  result: AnalyzeResponse;
  onRetry: () => void;
  onHome: () => void;
};

const COMMANDS_HINT = "Diga: repetir, ler tudo, nova foto, ou início.";

// Acima deste tamanho, a fala inicial vira um resumo ("N palavras")
// — usuários com baixa visão relatam frustração com excesso de informação.
const SHORT_TEXT_LIMIT = 160;

export default function Result({ result, onRetry, onHome }: Props) {
  // estado do laço de comandos de voz, exibido como dica visual
  const [voiceStatus, setVoiceStatus] = useState("Preparando áudio…");
  // executa o fluxo de voz uma vez só (StrictMode monta 2x em dev)
  const ranRef = useRef(false);
  const cancelledRef = useRef(false);

  const isTextLong =
    result.type === "text" && cleanText(result.result).length > SHORT_TEXT_LIMIT;

  useEffect(() => {
    cancelledRef.current = false;
    if (!ranRef.current) {
      ranRef.current = true;
      runVoiceFlow();
    }
    return () => {
      cancelledRef.current = true;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- fala ----------

  function buildSummary(): string {
    if (result.type === "text") {
      const cleaned = cleanText(result.result);
      if (cleaned.length <= SHORT_TEXT_LIMIT) {
        return `Texto identificado. Está escrito: ${cleaned}`;
      }
      const words = cleaned.split(" ").length;
      return `Texto identificado, com cerca de ${words} palavras. Diga ler tudo para ouvir o texto completo.`;
    }

    if (result.type === "object") {
      const objs = result.objects ?? [];
      if (objs.length > 0) {
        const first = describeObject(objs[0]);
        const rest = objs.slice(1, 3).map(describeObject);
        return rest.length
          ? `Objeto identificado: ${first}. Também detectei: ${rest.join("; ")}.`
          : `Objeto identificado: ${first}.`;
      }
      return `Objeto identificado: ${result.result}.`;
    }

    // unknown / error
    return result.result;
  }

  function describeObject(o: { name_pt: string; position: string }): string {
    return o.position ? `${o.name_pt}, ${o.position}` : o.name_pt;
  }

  async function speakFullText() {
    if (result.type === "text") {
      await speakAsync(`Está escrito: ${cleanText(result.result)}`);
    } else {
      await speakAsync(buildSummary());
    }
  }

  // ---------- laço de comandos de voz ----------

  async function runVoiceFlow() {
    if (result.type === "error") vibrateError();
    else vibrateResult();

    const summary = buildSummary();
    await speakAsync(summary);
    if (cancelledRef.current) return;

    if (!isSpeechRecognitionSupported()) {
      setVoiceStatus("Comandos de voz indisponíveis. Use os botões.");
      return;
    }

    await speakAsync(COMMANDS_HINT);

    let misses = 0;
    while (!cancelledRef.current && misses < 3) {
      setVoiceStatus("Ouvindo… " + COMMANDS_HINT);
      const heard = await listenOnce(6000);
      if (cancelledRef.current) return;

      if (heard === null) {
        // silêncio: para de ouvir e deixa os botões
        setVoiceStatus("Nenhum comando ouvido. Use os botões na tela.");
        return;
      }

      if (heard.includes("repetir")) {
        await speakAsync(summary);
        continue;
      }
      if (heard.includes("ler")) {
        await speakFullText();
        continue;
      }
      if (
        heard.includes("nova") ||
        heard.includes("tentar") ||
        heard.includes("câmera") ||
        heard.includes("camera") ||
        heard.includes("foto")
      ) {
        onRetry();
        return;
      }
      if (
        heard.includes("início") ||
        heard.includes("inicio") ||
        heard.includes("voltar") ||
        heard.includes("sair")
      ) {
        onHome();
        return;
      }

      misses++;
      await speakAsync("Não entendi. " + COMMANDS_HINT);
    }

    setVoiceStatus("Use os botões na tela.");
  }

  function handleReadAllButton() {
    stopSpeaking();
    speakFullText();
  }

  return (
    <div className="card" role="main" aria-label="Resultado da análise">
      <h2 className="h2">Resultado</h2>

      <div className="result-block">
        <div className="result-line">
          <span className="result-label">Tipo:</span>
          <span>{formatType(result.type)}</span>
        </div>

        <div className="result-line">
          <span className="result-label">Confiança:</span>
          <span>{formatConfidence(result.confidence)}</span>
        </div>

        <div className="result-content">
          <div className="result-label">Conteúdo:</div>
          <div className="result-box">{result.result}</div>
        </div>

        {(result.objects?.length ?? 0) > 0 && (
          <div className="result-content">
            <div className="result-label">Objetos (grade 3x3):</div>
            <div className="result-box">
              {result.objects!.map((o, i) => (
                <div key={i}>
                  {o.name_pt}
                  {o.position ? ` — ${o.position}` : ""} ({Math.round(o.score * 100)}%)
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="result-meta" aria-live="polite">{voiceStatus}</div>
      </div>

      {isTextLong && (
        <div className="row">
          <button
            className="btn-secondary"
            onClick={handleReadAllButton}
            aria-label="Ler o texto completo em voz alta"
          >
            Ler tudo
          </button>
        </div>
      )}

      <div className="row">
        <button
          className="btn-secondary"
          onClick={onRetry}
          aria-label="Tentar novamente, voltar para câmera"
        >
          Nova foto
        </button>
        <button
          className="btn-secondary"
          onClick={onHome}
          aria-label="Voltar para a tela inicial"
        >
          Início
        </button>
      </div>
    </div>
  );
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function formatType(t: AnalyzeResponse["type"]) {
  switch (t) {
    case "text":
      return "Texto";
    case "object":
      return "Objeto";
    case "unknown":
      return "Desconhecido";
    default:
      return "Erro";
  }
}

function formatConfidence(v: number) {
  if (Number.isNaN(v)) return "-";
  return `${Math.round(v * 100)}%`;
}
