// Feedback háptico complementar ao áudio (Chrome Android).
// Padrões distintos por evento para comunicar estado sem depender da visão.

export function vibrate(pattern: number | number[]) {
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

// posicionamento bom na câmera — um pulso firme
export const vibrateReady = () => vibrate(90);

// captura confirmada — pulso duplo curto
export const vibrateCapture = () => vibrate([40, 60, 40]);

// resultado disponível — pulso curto
export const vibrateResult = () => vibrate(60);

// erro — pulso triplo longo
export const vibrateError = () => vibrate([150, 80, 150, 80, 150]);
