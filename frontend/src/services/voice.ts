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

// Fala e resolve quando terminar — necessário para encadear fala + escuta
// sem que o microfone capte a própria síntese de voz.
export function speakAsync(
  text: string,
  opts?: { rate?: number; pitch?: number }
): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();

    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    if (opts?.rate) u.rate = opts.rate;
    if (opts?.pitch) u.pitch = opts.pitch;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallback);
      resolve();
    };

    // fallback: alguns navegadores não disparam onend de forma confiável
    const fallback = window.setTimeout(finish, 3000 + text.length * 100);

    u.onend = finish;
    u.onerror = finish;

    window.speechSynthesis.speak(u);
  });
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

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

// Escuta UMA fala do usuário e devolve a transcrição (minúscula, sem espaços
// nas pontas), ou null em caso de silêncio, erro ou falta de suporte.
// Obs.: o SpeechRecognition do Chrome processa na nuvem — exige internet.
export function listenOnce(timeoutMs = 6000): Promise<string | null> {
  const SR = getSpeechRecognitionCtor();
  if (!SR) return Promise.resolve(null);

  return new Promise<string | null>((resolve) => {
    const recog = new SR();
    recog.lang = "pt-BR";
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    let finished = false;

    function finish(value: string | null) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      try {
        recog.stop();
      } catch {}
      resolve(value);
    }

    const timer = window.setTimeout(() => finish(null), timeoutMs);

    recog.onresult = (e: any) => {
      const t = (e?.results?.[0]?.[0]?.transcript || "").toLowerCase().trim();
      finish(t || null);
    };
    recog.onerror = () => finish(null);
    recog.onend = () => finish(null); // terminou sem resultado = silêncio

    try {
      recog.start();
    } catch {
      finish(null);
    }
  });
}
