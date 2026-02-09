import React, { useEffect, useRef, useState } from "react";
import { listenForCommand5s, speak, stopSpeaking } from "../services/voice";


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

      // Saudação visual e auditiva
      speak("Olá! Diga abrir câmera ou toque no botão para iniciar.");
      setStatus("Aguardando comando por 5 segundos…");

      // Aguarda comando por 5s. Silêncio/outro = abort.
      const outcome = await listenForCommand5s(); // aguarda comando de voz
      if (cancelled) return;

      if (outcome === "open_camera") {
        setStatus("Abrindo câmera…");
        onOpenCamera(); // solicita abrir câmera para o App
        return;
      }

      // abort / not_supported -> não faz nada, fica na tela
      setStatus(
        outcome === "not_supported"
          ? "Reconhecimento de voz não disponível. Use os botões."
          : "Comando inválido ou silêncio. Processo abortado."
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
        <p className="p">
          Olá! Diga “abrir câmera” ou toque no botão para iniciar.
        </p>

        {/* Área central do card */}
        <div className="home-center">
          <button className="btn-primary" onClick={onOpenCamera}>
            Abrir câmera
          </button>
        </div>

        <p className="hint">Aguardando comando por 5 segundos…</p>
      </div>
    </div>
  );
}

