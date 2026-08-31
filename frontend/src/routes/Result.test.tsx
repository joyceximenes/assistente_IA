import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeResponse } from "../app";
import Result from "./Result";

// Os dois módulos de saída (voz e vibração) viram dublês: o que está sendo
// testado é a POLÍTICA de fala do Result, não a Web Speech API.
vi.mock("../services/voice", () => ({
  speak: vi.fn(),
  speakAsync: vi.fn(() => Promise.resolve()),
  stopSpeaking: vi.fn(),
  isSpeechRecognitionSupported: vi.fn(() => false),
  listenOnce: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../services/haptics", () => ({
  vibrateResult: vi.fn(),
  vibrateError: vi.fn(),
  vibrateReady: vi.fn(),
  vibrateCapture: vi.fn(),
  vibrate: vi.fn(),
}));

import { vibrateError, vibrateResult } from "../services/haptics";
import {
  isSpeechRecognitionSupported,
  listenOnce,
  speakAsync,
  stopSpeaking,
} from "../services/voice";

const speakAsyncMock = vi.mocked(speakAsync);
const listenOnceMock = vi.mocked(listenOnce);
const supportedMock = vi.mocked(isSpeechRecognitionSupported);

// Textos falados, na ordem — é o contrato observável do fluxo de voz.
const falas = () => speakAsyncMock.mock.calls.map(([texto]) => texto);

function textResult(texto: string, confidence = 0.9): AnalyzeResponse {
  return { type: "text", result: texto, confidence, meta: null };
}

function objectResult(objects: AnalyzeResponse["objects"]): AnalyzeResponse {
  return { type: "object", result: "garrafa", confidence: 0.87, objects, meta: null };
}

// O fluxo de voz roda em promessas depois da montagem. Nos testes que só olham
// a interface, esperar o status assentar evita o aviso de update fora do act().
async function fluxoDeVozAssentado() {
  await screen.findByText(/comandos de voz indisponíveis/i);
}

function renderResult(result: AnalyzeResponse) {
  const onRetry = vi.fn();
  const onHome = vi.fn();
  const view = render(<Result result={result} onRetry={onRetry} onHome={onHome} />);
  return { ...view, onRetry, onHome };
}

// Encadeia respostas do microfone; o que passar disso vira silêncio (null).
function ouvir(...transcricoes: string[]) {
  for (const t of transcricoes) listenOnceMock.mockResolvedValueOnce(t);
  listenOnceMock.mockResolvedValue(null);
}

const TEXTO_CURTO = "Leite integral 1 litro";
const TEXTO_LONGO = `${"palavra ".repeat(40)}fim`; // > 160 caracteres

beforeEach(() => {
  vi.clearAllMocks();
  speakAsyncMock.mockResolvedValue(undefined);
  supportedMock.mockReturnValue(false);
  listenOnceMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- o que é falado ao montar ----------

describe("fala inicial (buildSummary)", () => {
  it("lê o texto na íntegra quando é curto", async () => {
    renderResult(textResult(TEXTO_CURTO));

    await waitFor(() => {
      expect(falas()[0]).toBe(`Texto identificado. Está escrito: ${TEXTO_CURTO}`);
    });
  });

  it("normaliza quebras de linha e espaços repetidos do OCR", async () => {
    renderResult(textResult("LEITE\n\n  INTEGRAL   1L"));

    await waitFor(() => {
      expect(falas()[0]).toBe("Texto identificado. Está escrito: LEITE INTEGRAL 1L");
    });
  });

  it("resume em número de palavras quando o texto passa de 160 caracteres", async () => {
    renderResult(textResult(TEXTO_LONGO));

    await waitFor(() => {
      expect(falas()[0]).toMatch(/^Texto identificado, com cerca de 41 palavras\./);
      expect(falas()[0]).toMatch(/diga ler tudo/i);
    });
    // o texto completo NÃO é falado sem o usuário pedir
    expect(falas()[0]).not.toContain(TEXTO_LONGO);
  });

  it("anuncia o objeto com a posição na grade 3x3", async () => {
    renderResult(
      objectResult([{ name: "Bottle", name_pt: "garrafa", score: 0.9, position: "no centro" }]),
    );

    await waitFor(() => {
      expect(falas()[0]).toBe("Objeto identificado: garrafa, no centro.");
    });
  });

  it("cita no máximo três objetos, para não afogar o usuário em informação", async () => {
    renderResult(
      objectResult([
        { name: "Bottle", name_pt: "garrafa", score: 0.9, position: "no centro" },
        { name: "Cup", name_pt: "copo", score: 0.8, position: "à esquerda" },
        { name: "Table", name_pt: "mesa", score: 0.7, position: "na parte de baixo" },
        { name: "Chair", name_pt: "cadeira", score: 0.6, position: "à direita" },
      ]),
    );

    await waitFor(() => {
      expect(falas()[0]).toBe(
        "Objeto identificado: garrafa, no centro. Também detectei: copo, à esquerda; mesa, na parte de baixo.",
      );
    });
    expect(falas()[0]).not.toContain("cadeira");
  });

  it("omite a posição quando o backend não devolve uma", async () => {
    renderResult(objectResult([{ name: "Bottle", name_pt: "garrafa", score: 0.9, position: "" }]));

    await waitFor(() => {
      expect(falas()[0]).toBe("Objeto identificado: garrafa.");
    });
  });

  it("cai no campo result quando type é object mas a lista vem vazia", async () => {
    renderResult(objectResult([]));

    await waitFor(() => {
      expect(falas()[0]).toBe("Objeto identificado: garrafa.");
    });
  });

  it("fala a mensagem de erro crua, sem prefixo", async () => {
    const erro = "Sem conexão com a internet. Conecte-se e tente novamente.";
    renderResult({ type: "error", result: erro, confidence: 0, meta: null });

    await waitFor(() => {
      expect(falas()[0]).toBe(erro);
    });
  });
});

// ---------- vibração ----------

describe("feedback háptico ao montar", () => {
  it("usa o padrão de resultado quando a análise deu certo", async () => {
    renderResult(textResult(TEXTO_CURTO));

    await waitFor(() => expect(vibrateResult).toHaveBeenCalledTimes(1));
    expect(vibrateError).not.toHaveBeenCalled();
  });

  it("usa o padrão de erro quando a análise falhou", async () => {
    renderResult({ type: "error", result: "Erro 500", confidence: 0, meta: null });

    await waitFor(() => expect(vibrateError).toHaveBeenCalledTimes(1));
    expect(vibrateResult).not.toHaveBeenCalled();
  });
});

// ---------- o guard do useEffect ----------

describe("useEffect guardado por ranRef", () => {
  it("roda o fluxo de voz uma vez só sob StrictMode (monta duas vezes em dev)", async () => {
    render(
      <StrictMode>
        <Result result={textResult(TEXTO_CURTO)} onRetry={vi.fn()} onHome={vi.fn()} />
      </StrictMode>,
    );

    await waitFor(() => expect(speakAsyncMock).toHaveBeenCalled());
    // sem o ranRef, o resumo seria falado (e vibrado) duas vezes
    expect(falas()).toEqual([`Texto identificado. Está escrito: ${TEXTO_CURTO}`]);
    expect(vibrateResult).toHaveBeenCalledTimes(1);
  });

  it("cala a fala e desliga o microfone ao desmontar", async () => {
    supportedMock.mockReturnValue(true);
    const { unmount } = renderResult(textResult(TEXTO_CURTO));

    await waitFor(() => expect(listenOnceMock).toHaveBeenCalled());
    const signal = listenOnceMock.mock.calls[0][1];
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(stopSpeaking).toHaveBeenCalled();
    // o abort corta o microfone na hora, sem esperar os 6s do timeout
    expect(signal?.aborted).toBe(true);
  });

  it("para de falar depois de desmontado, mesmo com fala em andamento", async () => {
    supportedMock.mockReturnValue(true);
    // segura a primeira fala para desmontar no meio dela
    let liberar: () => void = () => {};
    speakAsyncMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          liberar = resolve;
        }),
    );

    const { unmount } = renderResult(textResult(TEXTO_CURTO));
    unmount();
    liberar();
    await Promise.resolve();

    // o fluxo aborta logo após o await: a dica de comandos não chega a ser falada
    await waitFor(() => expect(speakAsyncMock).toHaveBeenCalledTimes(1));
    expect(listenOnceMock).not.toHaveBeenCalled();
  });
});

// ---------- laço de comandos de voz ----------

describe("laço de comandos de voz", () => {
  it("avisa que os comandos estão indisponíveis e nem tenta ouvir", async () => {
    supportedMock.mockReturnValue(false);
    renderResult(textResult(TEXTO_CURTO));

    expect(await screen.findByText(/comandos de voz indisponíveis/i)).toBeInTheDocument();
    expect(listenOnceMock).not.toHaveBeenCalled();
  });

  it("anuncia os comandos disponíveis antes de começar a ouvir", async () => {
    supportedMock.mockReturnValue(true);
    renderResult(textResult(TEXTO_CURTO));

    await waitFor(() => {
      expect(falas()[1]).toBe("Diga: repetir, ler tudo, nova foto, ou início.");
    });
  });

  it('"repetir" fala o mesmo resumo de novo e continua ouvindo', async () => {
    supportedMock.mockReturnValue(true);
    ouvir("repetir");
    renderResult(textResult(TEXTO_CURTO));

    const resumo = `Texto identificado. Está escrito: ${TEXTO_CURTO}`;
    await waitFor(() => {
      expect(falas().filter((f) => f === resumo)).toHaveLength(2);
    });
    expect(listenOnceMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('"ler tudo" fala o texto completo mesmo quando o resumo foi encurtado', async () => {
    supportedMock.mockReturnValue(true);
    ouvir("ler tudo");
    renderResult(textResult(TEXTO_LONGO));

    await waitFor(() => {
      expect(falas().some((f) => f.startsWith("Está escrito: "))).toBe(true);
    });
  });

  it.each([["nova foto"], ["tentar de novo"], ["abrir a câmera"], ["camera"]])(
    '"%s" volta para a câmera',
    async (comando) => {
      supportedMock.mockReturnValue(true);
      ouvir(comando);
      const { onRetry, onHome } = renderResult(textResult(TEXTO_CURTO));

      await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
      expect(onHome).not.toHaveBeenCalled();
    },
  );

  it.each([["início"], ["inicio"], ["voltar"], ["sair"]])(
    '"%s" volta para a tela inicial',
    async (comando) => {
      supportedMock.mockReturnValue(true);
      ouvir(comando);
      const { onRetry, onHome } = renderResult(textResult(TEXTO_CURTO));

      await waitFor(() => expect(onHome).toHaveBeenCalledTimes(1));
      expect(onRetry).not.toHaveBeenCalled();
    },
  );

  it("para de ouvir no primeiro silêncio e devolve o usuário aos botões", async () => {
    supportedMock.mockReturnValue(true);
    listenOnceMock.mockResolvedValue(null);
    renderResult(textResult(TEXTO_CURTO));

    expect(await screen.findByText(/nenhum comando ouvido/i)).toBeInTheDocument();
    expect(listenOnceMock).toHaveBeenCalledTimes(1);
  });

  it("desiste depois de três comandos não entendidos", async () => {
    supportedMock.mockReturnValue(true);
    listenOnceMock.mockResolvedValue("blablabla");
    renderResult(textResult(TEXTO_CURTO));

    expect(await screen.findByText("Use os botões na tela.")).toBeInTheDocument();
    expect(falas().filter((f) => f.startsWith("Não entendi."))).toHaveLength(3);
    expect(listenOnceMock).toHaveBeenCalledTimes(3);
  });

  it("passa o mesmo AbortSignal do efeito para cada escuta", async () => {
    supportedMock.mockReturnValue(true);
    listenOnceMock.mockResolvedValue("blablabla");
    renderResult(textResult(TEXTO_CURTO));

    await waitFor(() => expect(listenOnceMock).toHaveBeenCalledTimes(3));
    const timeouts = listenOnceMock.mock.calls.map(([ms]) => ms);
    const signals = listenOnceMock.mock.calls.map(([, s]) => s);
    expect(timeouts).toEqual([6000, 6000, 6000]);
    expect(new Set(signals).size).toBe(1);
  });
});

// ---------- interface visível ----------

describe("interface", () => {
  it("mostra tipo, confiança e conteúdo", async () => {
    renderResult(textResult(TEXTO_CURTO, 0.873));

    expect(screen.getByText("Texto")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText(TEXTO_CURTO)).toBeInTheDocument();
    await fluxoDeVozAssentado();
  });

  it("mostra '-' quando a confiança não é um número", async () => {
    renderResult(textResult(TEXTO_CURTO, Number.NaN));

    expect(screen.getByText("-")).toBeInTheDocument();
    await fluxoDeVozAssentado();
  });

  it("lista os objetos com posição e score em porcentagem", async () => {
    renderResult(
      objectResult([{ name: "Bottle", name_pt: "garrafa", score: 0.874, position: "no centro" }]),
    );

    expect(screen.getByText(/garrafa — no centro \(87%\)/)).toBeInTheDocument();
    await fluxoDeVozAssentado();
  });

  it("só oferece o botão 'Ler tudo' quando o texto foi encurtado", async () => {
    const { unmount } = renderResult(textResult(TEXTO_CURTO));
    expect(screen.queryByRole("button", { name: /ler o texto completo/i })).toBeNull();
    await fluxoDeVozAssentado();
    unmount();

    renderResult(textResult(TEXTO_LONGO));
    expect(screen.getByRole("button", { name: /ler o texto completo/i })).toBeInTheDocument();
    await fluxoDeVozAssentado();
  });

  it("o botão 'Ler tudo' corta a fala atual antes de ler o texto completo", async () => {
    const user = userEvent.setup();
    renderResult(textResult(TEXTO_LONGO));

    await user.click(screen.getByRole("button", { name: /ler o texto completo/i }));

    expect(stopSpeaking).toHaveBeenCalled();
    expect(falas().at(-1)).toBe(`Está escrito: ${TEXTO_LONGO}`);
    await fluxoDeVozAssentado();
  });

  it("os botões de navegação chamam os callbacks recebidos", async () => {
    const user = userEvent.setup();
    const { onRetry, onHome } = renderResult(textResult(TEXTO_CURTO));

    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));
    await user.click(screen.getByRole("button", { name: /tela inicial/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onHome).toHaveBeenCalledTimes(1);
    await fluxoDeVozAssentado();
  });

  it("o status de voz fica em uma região aria-live, para o leitor de tela anunciar", async () => {
    renderResult(textResult(TEXTO_CURTO));

    const status = await screen.findByText(/comandos de voz indisponíveis/i);
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("rotula a região principal para navegação por landmarks", async () => {
    renderResult(textResult(TEXTO_CURTO));

    expect(screen.getByRole("main", { name: /resultado da análise/i })).toBeInTheDocument();
    await fluxoDeVozAssentado();
  });
});
