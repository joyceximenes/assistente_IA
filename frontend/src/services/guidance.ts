export type Guidance = {
  ok: boolean;
  message: string; // instrução para usuário
  blurScore: number;
  edgeScore: number;
};

export function analyzeFrameForGuidance(
  imageData: ImageData
): Guidance {
  const { data, width, height } = imageData;

  // Converte para luminância (grayscale)
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Laplacian simples -> blur score ~ variância do laplaciano
  let sum = 0;
  let sum2 = 0;
  let count = 0;

  // Edge score: soma de gradiente (Sobel-like simples)
  let edgeSum = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      const c = gray[idx];
      const up = gray[idx - width];
      const down = gray[idx + width];
      const left = gray[idx - 1];
      const right = gray[idx + 1];

      // laplacian
      const lap = (up + down + left + right) - 4 * c;
      sum += lap;
      sum2 += lap * lap;
      count++;

      // gradient magnitude approx
      const gx = right - left;
      const gy = down - up;
      edgeSum += Math.abs(gx) + Math.abs(gy);
    }
  }

  const mean = sum / Math.max(1, count);
  const variance = sum2 / Math.max(1, count) - mean * mean;

  const blurScore = variance; // maior = mais nítido
  const edgeScore = edgeSum / Math.max(1, count); // maior = mais detalhe/borda

  // thresholds empiricamente razoáveis para frames pequenos
  const BLUR_MIN = 120;      // muito baixo => desfocado/tremido
  const EDGE_LOW = 18;       // baixo => longe/escuro
  const EDGE_HIGH = 55;      // alto demais => muito perto/cortando

  if (blurScore < BLUR_MIN) {
    return { ok: false, message: "Mantenha firme e ajuste o foco.", blurScore, edgeScore };
  }

  if (edgeScore < EDGE_LOW) {
    return { ok: false, message: "Aproxime a câmera.", blurScore, edgeScore };
  }

  if (edgeScore > EDGE_HIGH) {
    return { ok: false, message: "Afaste um pouco a câmera.", blurScore, edgeScore };
  }

  return { ok: true, message: "Posicionamento bom. Pode capturar.", blurScore, edgeScore };
}
