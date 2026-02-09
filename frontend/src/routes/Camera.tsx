import React, { useEffect, useRef, useState } from "react";
import { analyzeFrameForGuidance } from "../services/guidance";
import { speakThrottled, stopSpeaking } from "../services/voice";

// ou voltar para a tela anterior ou o App vai enviar para analyze
type Props = {
  onBack: () => void;
  onCaptured: (imageBlob: Blob) => void;
};

export default function Camera({ onBack, onCaptured }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // se falhar a permissão/captura
  const [error, setError] = useState<string | null>(null);
  // habilita o botão de captura
  const [ready, setReady] = useState(false);
  // mensagem de orientação para o usuário
  const [hint, setHint] = useState("Centralize o conteúdo no alvo.");

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    async function start() {
      try {
        setError(null);
        setReady(false);

        // pede permissão e inicia a câmera traseira, se possível
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) return;

        streamRef.current = stream;

        // liga o preview de vídeo
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();
        setReady(true);

        // atualiza a cada 700ms as dicas para o usuário
        intervalId = window.setInterval(() => {
          tryGuidance();
        }, 700);
      } catch {
        setError(
          "Não foi possível acessar a câmera. Verifique permissões e tente novamente."
        );
      }
    }

    function tryGuidance() {
      const video = videoRef.current;
      if (!video) return;
      if (!video.videoWidth || !video.videoHeight) return;

      // reduz resolução para processamento mais rápido
      const targetW = 240;
      const scale = targetW / video.videoWidth;
      const targetH = Math.max(1, Math.round(video.videoHeight * scale));

      // transforma o frame em um array de pixels
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, targetW, targetH);
      const img = ctx.getImageData(0, 0, targetW, targetH);

      const g = analyzeFrameForGuidance(img); // analise de orientação
      setHint(g.message); // mostra a mensagem para o usuário

      speakThrottled(g.message, 1300); // fala a mensagem em voz alta
    }

    start();

    // cancela todos os eventos ao desmontar
    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      stopSpeaking();
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function stopCamera() {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;

    // valida as dimensões do vídeo
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      setError("Câmera ainda não está pronta para captura.");
      return;
    }

    // cria um canvas temporário para capturar o frame
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Falha ao preparar captura.");
      return;
    }

    // cria a imagem no canvas
    ctx.drawImage(video, 0, 0, width, height);

    // converte o conteúdo do canvas para um blob JPEG
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );

    if (!blob) {
      setError("Falha ao capturar imagem.");
      return;
    }

    stopCamera();
    onCaptured(blob);
  }

  return (
    <div className="camera-container">
      <div className="camera-preview-wrap">
        <video
          ref={videoRef}
          className="camera-video"
          playsInline
          muted
          autoPlay
        />
        <div className="camera-reticle" aria-hidden="true" />
      </div>

      <div className="camera-controls">
        {error && <div className="camera-error">{error}</div>}

        <div className="camera-hint">{hint}</div>

        <button
          className={`btn-primary camera-capture ${!ready ? "btn-disabled" : ""}`}
          onClick={capture}
          disabled={!ready}
        >
          Capturar
        </button>

        <button className="btn-secondary camera-back" onClick={onBack}>
          Voltar
        </button>
      </div>
    </div>
  );
}
