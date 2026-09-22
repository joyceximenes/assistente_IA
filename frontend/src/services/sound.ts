// Tom curto e discreto, repetido em loop, para indicar que uma operação
// assíncrona (ex.: análise da imagem) está em andamento e o app não travou.
// Gerado via Web Audio API — sem depender de nenhum arquivo de áudio.

let audioCtx: AudioContext | null = null;
let intervalId: number | null = null;

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function getContext(): AudioContext | null {
  const w = window as WindowWithWebkitAudio;
  const Ctor = window.AudioContext || w.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

function playTick() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;

  // envelope curto (fade in/out) para não soar como um clique seco
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.03);
  gain.gain.linearRampToValueAtTime(0, now + 0.18);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

export function startProcessingLoop(intervalMs = 1500) {
  if (intervalId !== null) return; // já rodando, não duplica
  playTick();
  intervalId = window.setInterval(playTick, intervalMs);
}

export function stopProcessingLoop() {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}
