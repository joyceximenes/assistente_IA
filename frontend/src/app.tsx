import React, {useEffect, useState } from "react";

import Home from "./routes/Home";
import Camera from "./routes/Camera";
import Result from "./routes/Result";
import { analyzeImage } from "./services/api";

// navegação, nessa ordem. useState
type Screen = "home" | "camera" | "result";

// contrato da resposta da análise. define como o front recebe de /analyze no back
export type AnalyzeResponse = {
  type: "text" | "object" | "unknown" | "error";
  result: string; // o que está escrito / qual objeto / mensagem de erro
  confidence: number; // nivel de confiança da inferência, em porcentagem
  meta?: {  // metadados para debug / info extra
    filename?: string | null;
    content_type?: string | null;
    bytes?: number | null;
  } | null;
  raw?: any; // dados brutos da API do google vision, para debug/melhorias
};

export default function App() {
  // guarda a tela atual do app
  const [screen, setScreen] = useState<Screen>("home");
  // guarda o resultado da última análise
  const [lastResult, setLastResult] = useState<AnalyzeResponse | null>(null);
  // controla se está analisando (mostra overlay)
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  /* funções de navegação */
  function goHome() {
    /* volta para home, limpando estado */
    setIsAnalyzing(false);
    setLastResult(null);
    setScreen("home");
  }

  function goCamera() {
    /* vai para câmera */
    setIsAnalyzing(false);
    setScreen("camera");
  }

  function goResult(result: AnalyzeResponse) {
    /* vai para resultado, guardando o resultado */
    setLastResult(result);
    setScreen("result");
  }

  useEffect(() => {
    const baseTitle = "Avia";

    switch (screen) {
      case "home":
        document.title = `${baseTitle} | Home`;
        break;

      case "camera":
        document.title = `${baseTitle} | Câmera`;
        break;

      case "result":
        document.title = `${baseTitle} | Resultado`;
        break;

      default:
        document.title = baseTitle;
    }
  }, [screen]);


  async function handleCaptured(blob: Blob) {
    /* trata a imagem capturada na câmera */
    setIsAnalyzing(true);

    try {
      const result = await analyzeImage(blob); // envia para o backend
      goResult(result); // vai para a tela de resultado
    } catch {
      goResult({
        type: "error",
        result:
          "Falha ao analisar imagem. Verifique conexão com o backend e tente novamente.",
        confidence: 0,
        meta: null,
      });
    } finally { // desativa o overlay de análise
      setIsAnalyzing(false);
    }
  }

  return (
    <div
      className={`app-container ${
        screen === "camera" ? "app-container-camera" : ""
      }`}
    >
      {isAnalyzing && (
        <div className="app-overlay" role="status" aria-live="polite">
          <div className="app-overlay-card">
            <div className="app-overlay-title">Analisando…</div>
            <div className="app-overlay-subtitle">Aguarde alguns segundos.</div>
          </div>
        </div>
      )}

      {/* se estiver na home, chama para abrir a câmera */}
      {screen === "home" && <Home onOpenCamera={goCamera}/>}

      {/* se estiver na camera, ou volta para home ou captura a imagem */}
      {screen === "camera" && (
        <Camera
          onBack={goHome}
          onCaptured={(blob) => {
            handleCaptured(blob);
          }}
        />
      )}

      {/* se estiver no resultado, mostra o resultado e opções de retry ou home */}
      {screen === "result" && lastResult && (
        <Result result={lastResult} 
        onRetry={goCamera} 
        onHome={goHome} />
      )}
    </div>
  );
}
