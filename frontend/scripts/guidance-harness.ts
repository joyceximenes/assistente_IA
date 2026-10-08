import { analyzeFrameForGuidance, type Guidance } from "../src/services/guidance";

declare global {
  interface Window {
    scoreImage: (dataUrl: string) => Promise<Guidance>;
  }
}

// Reproduz o mesmo redimensionamento que Camera.tsx faz do frame de vídeo
// (tryGuidance), só que a partir de uma imagem estática em vez do <video>.
window.scoreImage = async (dataUrl: string): Promise<Guidance> => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const targetW = 240;
  const scale = targetW / img.naturalWidth;
  const targetH = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context não disponível.");

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const imageData = ctx.getImageData(0, 0, targetW, targetH);

  return analyzeFrameForGuidance(imageData);
};
