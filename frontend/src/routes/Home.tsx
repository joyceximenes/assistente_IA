import { useEffect, useRef, useState } from "react";
import {
  isSpeechRecognitionSupported,
  listenOnce,
  speakAsync,
  stopSpeaking,
} from "../services/voice";

// dispara evento de voz para abrir câmera
type Props = {
  onOpenCamera: () => void;
};

export default function Home({ onOpenCamera }: Props) {
  // texto informativo na tela
  const [status, setStatus] = useState<string>("Pronto");
  // so fala uma vez, mesmo se o componente rerenderizar
  const ranRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function runOnce() {
      if (ranRef.current) return;
      ranRef.current = true; // executa uma vez só

      // Saudação visual e auditiva (aguarda terminar antes de ouvir,
      // para o microfone não captar a própria fala)
      await speakAsync("Olá! Diga abrir câmera ou toque no botão para iniciar.");
      if (cancelled) return;

      if (!isSpeechRecognitionSupported()) {
        setStatus("Reconhecimento de voz não disponível. Use os botões.");
        return;
      }

      setStatus("Aguardando comando por 5 segundos…");

      // Aguarda comando por 5s. Silêncio/outro = abort.
      const heard = await listenOnce(5000);
      if (cancelled) return;

      if (
        heard &&
        (heard.includes("câmera") || heard.includes("camera") || heard.includes("abrir"))
      ) {
        setStatus("Abrindo câmera…");
        onOpenCamera(); // solicita abrir câmera para o App
        return;
      }

      setStatus(
        heard === null
          ? "Nenhum comando ouvido. Toque no botão para iniciar."
          : "Comando não reconhecido. Toque no botão para iniciar.",
      );
    }

    runOnce();

    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [onOpenCamera]);

  return (
    <div className="home">
      <h1 className="home-title">Avia - Assistente Visual Acessível</h1>

      <div className="card home-card">
        <p className="p">Olá! Diga “abrir câmera” ou toque no botão para iniciar.</p>

        {/* Área central do card */}
        <div className="home-center">
          <button
            type="button"
            className="btn-primary"
            onClick={onOpenCamera}
            aria-label="Abrir câmera para capturar imagem"
          >
            Abrir câmera
          </button>
        </div>

        <p className="hint" aria-live="polite">
          {status}
        </p>
      </div>
    </div>
  );
}
