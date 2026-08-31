import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSpeechRecognitionSupported, listenOnce, speak, speakAsync, stopSpeaking } from "./voice";

// ---------- dublês das APIs de navegador ----------

type Utterance = {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

let spoken: Utterance[] = [];
let cancelCount = 0;

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  pitch = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function installSpeechSynthesis() {
  spoken = [];
  cancelCount = 0;
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", {
    cancel: () => {
      cancelCount++;
    },
    speak: (u: Utterance) => {
      spoken.push(u);
    },
  });
}

// Reconhecimento de fala: guarda a última instância para o teste dirigir os eventos.
type FakeRecog = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  started: boolean;
  stopped: boolean;
  aborted: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

let lastRecog: FakeRecog | null = null;

function installSpeechRecognition(opts: { startThrows?: boolean } = {}) {
  lastRecog = null;
  function Ctor(this: FakeRecog) {
    this.lang = "";
    this.interimResults = true;
    this.maxAlternatives = 0;
    this.started = false;
    this.stopped = false;
    this.aborted = false;
    this.start = () => {
      if (opts.startThrows) throw new Error("not-allowed");
      this.started = true;
    };
    this.stop = () => {
      this.stopped = true;
    };
    this.abort = () => {
      this.aborted = true;
    };
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    lastRecog = this;
  }
  // biome-ignore lint/suspicious/noExplicitAny: dublê mínimo da API vendor-prefixed
  (window as any).SpeechRecognition = Ctor;
}

function transcript(text: string) {
  return { results: [[{ transcript: text }]] };
}

beforeEach(() => {
  installSpeechSynthesis();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // biome-ignore lint/suspicious/noExplicitAny: limpeza do dublê
  (window as any).SpeechRecognition = undefined;
  // biome-ignore lint/suspicious/noExplicitAny: limpeza do dublê
  (window as any).webkitSpeechRecognition = undefined;
});

// ---------- síntese ----------

describe("speak", () => {
  it("fala em pt-BR", () => {
    speak("olá");

    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("olá");
    expect(spoken[0].lang).toBe("pt-BR");
  });

  it("cancela a fala anterior antes de falar (política de interrupção atual)", () => {
    speak("primeira");
    speak("segunda");

    // toda fala nova mata a anterior — documentado como pendência:
    // uma dica de enquadramento pode truncar a leitura de um rótulo longo
    expect(cancelCount).toBe(2);
  });

  it("mantém rate e pitch no padrão quando o chamador não passa nada", () => {
    speak("sem opções");

    expect(spoken[0].rate).toBe(1);
    expect(spoken[0].pitch).toBe(1);
  });

  it("aplica rate e pitch quando informados", () => {
    speak("mais rápido", { rate: 1.8, pitch: 1.2 });

    expect(spoken[0].rate).toBe(1.8);
    expect(spoken[0].pitch).toBe(1.2);
  });

  it("não quebra quando o navegador não tem speechSynthesis", () => {
    vi.unstubAllGlobals();

    expect(() => speak("qualquer coisa")).not.toThrow();
  });
});

describe("speakAsync", () => {
  it("resolve quando o onend dispara", async () => {
    const p = speakAsync("texto");
    spoken[0].onend?.();

    await expect(p).resolves.toBeUndefined();
  });

  it("resolve também no onerror, para o fluxo de voz não travar", async () => {
    const p = speakAsync("texto");
    spoken[0].onerror?.();

    await expect(p).resolves.toBeUndefined();
  });

  it("resolve pelo fallback de tempo quando o onend nunca vem", async () => {
    vi.useFakeTimers();

    const p = speakAsync("abc"); // fallback = 3000 + 3 * 100
    await vi.advanceTimersByTimeAsync(3300);

    await expect(p).resolves.toBeUndefined();
  });

  it("resolve uma vez só quando onend e fallback disparam", async () => {
    vi.useFakeTimers();
    const done = vi.fn();

    const p = speakAsync("abc").then(done);
    spoken[0].onend?.();
    spoken[0].onend?.();
    await vi.advanceTimersByTimeAsync(5000);
    await p;

    expect(done).toHaveBeenCalledTimes(1);
  });

  it("resolve imediatamente quando não há speechSynthesis", async () => {
    vi.unstubAllGlobals();

    await expect(speakAsync("texto")).resolves.toBeUndefined();
  });
});

describe("stopSpeaking", () => {
  it("cancela a fala em andamento", () => {
    stopSpeaking();

    expect(cancelCount).toBe(1);
  });
});

describe("speakThrottled", () => {
  // `lastSpokenAt` é estado de módulo e sobrevive entre testes. Reimportamos o
  // módulo a cada caso para que cada um comece com o cooldown zerado.
  async function freshSpeakThrottled() {
    vi.resetModules();
    const mod = await import("./voice");
    return mod.speakThrottled;
  }

  it("engole a segunda chamada dentro do cooldown", async () => {
    const fn = await freshSpeakThrottled();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    fn("dica", 1200);
    fn("dica de novo", 1200);

    expect(spoken.map((u) => u.text)).toEqual(["dica"]);
  });

  it("volta a falar depois do cooldown", async () => {
    const fn = await freshSpeakThrottled();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    fn("primeira", 1200);
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    fn("segunda", 1200);

    expect(spoken.map((u) => u.text)).toEqual(["primeira", "segunda"]);
  });

  it("respeita o cooldown padrão de 1200ms quando não é informado", async () => {
    const fn = await freshSpeakThrottled();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    fn("dica");
    vi.setSystemTime(new Date("2026-01-01T00:00:01Z")); // 1000ms < 1200ms
    fn("cedo demais");

    expect(spoken.map((u) => u.text)).toEqual(["dica"]);
  });
});

// ---------- reconhecimento ----------

describe("isSpeechRecognitionSupported", () => {
  it("é falso quando nem SpeechRecognition nem o prefixo webkit existem", () => {
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it("aceita a variante vendor-prefixed do Chrome", () => {
    // biome-ignore lint/suspicious/noExplicitAny: dublê mínimo
    (window as any).webkitSpeechRecognition = () => {};

    expect(isSpeechRecognitionSupported()).toBe(true);
  });
});

describe("listenOnce", () => {
  it("devolve null na hora quando não há suporte", async () => {
    await expect(listenOnce(6000)).resolves.toBeNull();
  });

  it("normaliza a transcrição para minúsculas e sem espaços nas pontas", async () => {
    installSpeechRecognition();

    const p = listenOnce(6000);
    lastRecog?.onresult?.(transcript("  Nova Foto  "));

    await expect(p).resolves.toBe("nova foto");
  });

  it("configura o reconhecimento em pt-BR, resultado único e sem parciais", async () => {
    installSpeechRecognition();

    const p = listenOnce(6000);

    expect(lastRecog?.lang).toBe("pt-BR");
    expect(lastRecog?.interimResults).toBe(false);
    expect(lastRecog?.maxAlternatives).toBe(1);
    expect(lastRecog?.started).toBe(true);

    lastRecog?.onresult?.(transcript("repetir"));
    await p;
  });

  it("trata transcrição vazia como silêncio (null)", async () => {
    installSpeechRecognition();

    const p = listenOnce(6000);
    lastRecog?.onresult?.(transcript("   "));

    await expect(p).resolves.toBeNull();
  });

  it("devolve null quando o reconhecimento termina sem resultado", async () => {
    installSpeechRecognition();

    const p = listenOnce(6000);
    lastRecog?.onend?.();

    await expect(p).resolves.toBeNull();
  });

  it("devolve null no erro do reconhecimento", async () => {
    installSpeechRecognition();

    const p = listenOnce(6000);
    lastRecog?.onerror?.();

    await expect(p).resolves.toBeNull();
  });

  it("devolve null quando estoura o timeout", async () => {
    vi.useFakeTimers();
    installSpeechRecognition();

    const p = listenOnce(6000);
    await vi.advanceTimersByTimeAsync(6000);

    await expect(p).resolves.toBeNull();
    expect(lastRecog?.stopped).toBe(true);
  });

  it("devolve null quando start() lança (permissão negada)", async () => {
    installSpeechRecognition({ startThrows: true });

    await expect(listenOnce(6000)).resolves.toBeNull();
  });

  it("nem inicia o microfone se o signal já vier abortado", async () => {
    installSpeechRecognition();
    const controller = new AbortController();
    controller.abort();

    await expect(listenOnce(6000, controller.signal)).resolves.toBeNull();
    expect(lastRecog).toBeNull();
  });

  it("desliga o microfone na hora quando o signal aborta no meio da escuta", async () => {
    installSpeechRecognition();
    const controller = new AbortController();

    const p = listenOnce(6000, controller.signal);
    expect(lastRecog?.started).toBe(true);

    controller.abort();

    // abort() e não stop(): corta o reconhecimento sem esperar resultado final
    await expect(p).resolves.toBeNull();
    expect(lastRecog?.aborted).toBe(true);
  });

  it("ignora resultado que chegue depois de já ter resolvido", async () => {
    installSpeechRecognition();

    const p = listenOnce(6000);
    lastRecog?.onresult?.(transcript("repetir"));
    lastRecog?.onresult?.(transcript("início"));

    await expect(p).resolves.toBe("repetir");
  });
});
