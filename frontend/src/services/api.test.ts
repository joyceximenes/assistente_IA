import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeImage, getApiBaseUrl } from "./api";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

const blob = new Blob(["fake-jpeg"], { type: "image/jpeg" });

beforeEach(() => {
  setOnline(true);
  // O .env local aponta VITE_API_BASE_URL para o IP da máquina (para testar no
  // celular). Fixamos vazio aqui para o teste valer em qualquer máquina e na CI.
  vi.stubEnv("VITE_API_BASE_URL", "");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getApiBaseUrl", () => {
  it("cai no localhost:8000 quando VITE_API_BASE_URL não está definida", () => {
    vi.stubEnv("VITE_API_BASE_URL", "");

    expect(getApiBaseUrl()).toBe("http://localhost:8000");
  });

  it("usa VITE_API_BASE_URL quando definida (é o que o deploy vai depender)", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://avia-backend.exemplo.app");

    expect(getApiBaseUrl()).toBe("https://avia-backend.exemplo.app");
  });
});

describe("analyzeImage", () => {
  it("nunca rejeita: falha de rede vira AnalyzeResponse de erro", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const res = await analyzeImage(blob);

    expect(res.type).toBe("error");
    expect(res.result).toMatch(/servidor/i);
    expect(res.confidence).toBe(0);
    expect(res.meta).toBeNull();
  });

  it("curto-circuita offline sem sequer chamar o fetch", async () => {
    setOnline(false);

    const res = await analyzeImage(blob);

    expect(fetch).not.toHaveBeenCalled();
    expect(res.type).toBe("error");
    expect(res.result).toMatch(/sem conexão/i);
  });

  it("posta em /analyze com o campo 'image' que o backend espera", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ type: "text", result: "LEITE", confidence: 0.9 }),
    );

    await analyzeImage(blob);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:8000/analyze");
    expect(init?.method).toBe("POST");

    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    // o nome do campo é contrato com o UploadFile = File(...) do FastAPI
    const sent = form.get("image") as File;
    expect(sent).toBeTruthy();
    expect((sent as File).name).toBe("capture.jpg");
  });

  it("repassa a resposta de sucesso sem alterar", async () => {
    const payload = {
      type: "object" as const,
      result: "garrafa",
      confidence: 0.87,
      objects: [{ name: "Bottle", name_pt: "garrafa", score: 0.87, position: "no centro" }],
      meta: null,
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload));

    await expect(analyzeImage(blob)).resolves.toEqual(payload);
  });

  it("usa o campo detail do backend quando a resposta não é 2xx", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: "Arquivo não é uma imagem." }, { ok: false, status: 400 }),
    );

    const res = await analyzeImage(blob);

    expect(res.type).toBe("error");
    expect(res.result).toBe("Arquivo não é uma imagem.");
  });

  it("cai no 'Erro <status>' quando a resposta de erro não traz detail", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as Response);

    const res = await analyzeImage(blob);

    expect(res.result).toBe("Erro 500");
  });

  it("trata 200 com corpo que não é JSON válido", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    } as unknown as Response);

    const res = await analyzeImage(blob);

    expect(res.type).toBe("error");
    expect(res.result).toMatch(/resposta inválida/i);
  });

  it("aborta a requisição depois de 15s e devolve erro em vez de pendurar", async () => {
    vi.useFakeTimers();

    // simula um backend que só responde quando o AbortController dispara
    vi.mocked(fetch).mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted")));
        }),
    );

    const promise = analyzeImage(blob);
    await vi.advanceTimersByTimeAsync(15_000);
    const res = await promise;

    expect(res.type).toBe("error");
    expect(res.result).toMatch(/servidor/i);

    vi.useRealTimers();
  });
});
