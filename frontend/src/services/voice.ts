// A Web Speech API (SpeechRecognition) ainda não tem tipos no lib.dom.d.ts
// padrão do TypeScript (é vendor-prefixed em alguns navegadores). Declaramos
// o subconjunto mínimo que usamos, em vez de recorrer a `any`.
interface SpeechRecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

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
export function speakAsync(text: string, opts?: { rate?: number; pitch?: number }): Promise<void> {
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

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as SpeechRecognitionWindow;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

// Escuta UMA fala do usuário e devolve a transcrição (minúscula, sem espaços
// nas pontas), ou null em caso de silêncio, erro, falta de suporte ou
// cancelamento via `signal`.
// Obs.: o SpeechRecognition do Chrome processa na nuvem — exige internet.
//
// `signal` permite ao chamador desligar o microfone imediatamente (ex.: o
// componente que iniciou a escuta desmontou) em vez de esperar o timeout —
// sem isso, o microfone continua ativo por até `timeoutMs` depois do usuário
// já ter saído da tela.
export function listenOnce(timeoutMs = 6000, signal?: AbortSignal): Promise<string | null> {
  const SR = getSpeechRecognitionCtor();
  if (!SR) return Promise.resolve(null);
  if (signal?.aborted) return Promise.resolve(null);

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
      signal?.removeEventListener("abort", onAbort);
      try {
        recog.stop();
      } catch {}
      resolve(value);
    }

    function onAbort() {
      // abort() corta o reconhecimento na hora, sem esperar um resultado
      // final — diferente de stop(), que pode processar o áudio já captado.
      try {
        recog.abort();
      } catch {}
      finish(null);
    }

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    signal?.addEventListener("abort", onAbort);

    recog.onresult = (e: SpeechRecognitionResultEvent) => {
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
