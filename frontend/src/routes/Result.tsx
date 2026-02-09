import React, { useEffect } from "react";
import type { AnalyzeResponse } from "../app";
import { speak } from "../services/voice";

// recebe as props o resultado da análise e funções para retry e home
type Props = {
  result: AnalyzeResponse;
  onRetry: () => void;
  onHome: () => void;
};

export default function Result({ result, onRetry, onHome }: Props) {
  // ao montar o componente, fala o resultado via síntese de voz
  useEffect(() => {
    if (result.type === "text") {
      speak(
        `Texto identificado. Está escrito: ${truncateForSpeech(
          result.result
        )}`
      );
    } else if (result.type === "object") {
      speak(`Objeto identificado: ${result.result}`);
    } else if (result.type === "unknown") {
      speak(result.result);
    } else {
      speak(`Erro: ${result.result}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card">
      <h2 className="h2">Resultado</h2>

      <div className="result-block">
        <div className="result-line">
          <span className="result-label">Tipo:</span>
          <span>{result.type}</span>
        </div>

        <div className="result-line">
          <span className="result-label">Confiança:</span>
          <span>{formatConfidence(result.confidence)}</span>
        </div>

        <div className="result-content">
          <div className="result-label">Conteúdo:</div>
          <div className="result-box">{result.result}</div>
        </div>

        {result.meta?.bytes != null && (
          <div className="result-meta">
            Tamanho (processado): {Math.round(result.meta.bytes / 1024)} KB
          </div>
        )}
      </div>

      <div className="row">
        <button className="btn-primary" onClick={onRetry}>
          Tentar novamente
        </button>
        <button className="btn-secondary" onClick={onHome}>
          Início
        </button>
      </div>
    </div>
  );
}

function formatConfidence(v: number) {
  if (Number.isNaN(v)) return "-";
  return `${Math.round(v * 100)}%`;
}

function truncateForSpeech(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 220 ? cleaned.slice(0, 220) + "…" : cleaned;
}
