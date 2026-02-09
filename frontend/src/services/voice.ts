type ListenOutcome = "open_camera" | "cancel" | "abort" | "not_supported";

export function speak(text: string, opts?: { rate?: number; pitch?: number }) {
  if (!("speechSynthesis" in window)) return;

  // Cancela falas anteriores para não acumular
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  if (opts?.rate) u.rate = opts.rate;
  if (opts?.pitch) u.pitch = opts.pitch;

  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

// Fala com “cooldown” para não repetir toda hora (útil na câmera)
let lastSpokenAt = 0;
export function speakThrottled(text: string, cooldownMs = 1200) {
  const now = Date.now();
  if (now - lastSpokenAt < cooldownMs) return;
  lastSpokenAt = now;
  speak(text);
}

function getSpeechRecognitionCtor(): any | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export async function listenForCommand5s(): Promise<ListenOutcome> {
  const SR = getSpeechRecognitionCtor();
  if (!SR) return "not_supported";

  return new Promise<ListenOutcome>((resolve) => {
    const recog = new SR();
    recog.lang = "pt-BR";
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    let finished = false;

    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        recog.stop();
      } catch {}
      resolve("abort"); // silêncio = abortar
    }, 5000);

    function done(outcome: ListenOutcome) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      try {
        recog.stop();
      } catch {}
      resolve(outcome);
    }

    recog.onresult = (e: any) => {
      const t = (e?.results?.[0]?.[0]?.transcript || "").toLowerCase().trim();

      // Qualquer coisa diferente de “abrir câmera” ou “cancelar” aborta
      if (t.includes("abrir") && t.includes("câmera")) return done("open_camera");
      if (t.includes("cancelar")) return done("cancel");

      return done("abort");
    };

    recog.onerror = () => done("abort");
    recog.onend = () => {
      // se terminar antes do timeout sem resultado -> abort
      if (!finished) done("abort");
    };

    try {
      recog.start();
    } catch {
      done("abort");
    }
  });
}
