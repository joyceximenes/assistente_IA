import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeResponse } from "./app";
import App from "./app";

// Camera e Home viram dublês: aqui o alvo é a máquina de navegação do App,
// não a captura em si (que depende de getUserMedia e não roda no jsdom).
vi.mock("./routes/Home", () => ({
  default: ({ onOpenCamera }: { onOpenCamera: () => void }) => (
    <button type="button" onClick={onOpenCamera}>
      abrir câmera
    </button>
  ),
}));

vi.mock("./routes/Camera", () => ({
  default: ({ onBack, onCaptured }: { onBack: () => void; onCaptured: (b: Blob) => void }) => (
    <div>
      <button type="button" onClick={onBack}>
        voltar
      </button>
      <button type="button" onClick={() => onCaptured(new Blob(["x"], { type: "image/jpeg" }))}>
        capturar
      </button>
    </div>
  ),
}));

vi.mock("./routes/Result", () => ({
  default: ({
    result,
    onRetry,
    onHome,
  }: {
    result: AnalyzeResponse;
    onRetry: () => void;
    onHome: () => void;
  }) => (
    <div>
      <div data-testid="resultado">{result.result}</div>
      <button type="button" onClick={onRetry}>
        nova foto
      </button>
      <button type="button" onClick={onHome}>
        início
      </button>
    </div>
  ),
}));

vi.mock("./services/api", () => ({ analyzeImage: vi.fn() }));
vi.mock("./services/voice", () => ({ speak: vi.fn() }));

import { analyzeImage } from "./services/api";
import { speak } from "./services/voice";

const analyzeImageMock = vi.mocked(analyzeImage);

const RESPOSTA: AnalyzeResponse = {
  type: "text",
  result: "LEITE INTEGRAL",
  confidence: 0.9,
  meta: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  analyzeImageMock.mockResolvedValue(RESPOSTA);
});

describe("navegação", () => {
  it("começa na home", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "abrir câmera" })).toBeInTheDocument();
  });

  it("home → câmera → home pelo botão voltar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "abrir câmera" }));
    expect(screen.getByRole("button", { name: "capturar" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "voltar" }));
    expect(screen.getByRole("button", { name: "abrir câmera" })).toBeInTheDocument();
  });

  it("captura leva ao resultado com a resposta da análise", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "abrir câmera" }));
    await user.click(screen.getByRole("button", { name: "capturar" }));

    expect(await screen.findByTestId("resultado")).toHaveTextContent("LEITE INTEGRAL");
    expect(analyzeImageMock).toHaveBeenCalledTimes(1);
    expect(analyzeImageMock.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it("'nova foto' volta para a câmera", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "abrir câmera" }));
    await user.click(screen.getByRole("button", { name: "capturar" }));
    await screen.findByTestId("resultado");

    await user.click(screen.getByRole("button", { name: "nova foto" }));
    expect(screen.getByRole("button", { name: "capturar" })).toBeInTheDocument();
  });

  it("voltar para a home limpa o último resultado", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "abrir câmera" }));
    await user.click(screen.getByRole("button", { name: "capturar" }));
    await screen.findByTestId("resultado");

    await user.click(screen.getByRole("button", { name: "início" }));

    expect(screen.getByRole("button", { name: "abrir câmera" })).toBeInTheDocument();
    expect(screen.queryByTestId("resultado")).toBeNull();
  });
});

describe("estado de análise", () => {
  it("anuncia e mostra o overlay enquanto analisa, e some ao terminar", async () => {
    const user = userEvent.setup();
    let liberar: (r: AnalyzeResponse) => void = () => {};
    analyzeImageMock.mockImplementationOnce(
      () =>
        new Promise<AnalyzeResponse>((resolve) => {
          liberar = resolve;
        }),
    );
    render(<App />);

    await user.click(screen.getByRole("button", { name: "abrir câmera" }));
    await user.click(screen.getByRole("button", { name: "capturar" }));

    // o overlay é anunciado pelo leitor de tela, não só visível
    const overlay = screen.getByRole("status");
    expect(overlay).toHaveAttribute("aria-live", "polite");
    expect(speak).toHaveBeenCalledWith("Analisando imagem. Aguarde alguns segundos.");

    liberar(RESPOSTA);

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("erro da análise também vira tela de resultado (analyzeImage nunca rejeita)", async () => {
    const user = userEvent.setup();
    analyzeImageMock.mockResolvedValue({
      type: "error",
      result: "Sem conexão com a internet. Conecte-se e tente novamente.",
      confidence: 0,
      meta: null,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "abrir câmera" }));
    await user.click(screen.getByRole("button", { name: "capturar" }));

    expect(await screen.findByTestId("resultado")).toHaveTextContent(/sem conexão/i);
  });
});

describe("título do documento", () => {
  it("acompanha a tela atual", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.title).toBe("Avia | Home");

    await user.click(screen.getByRole("button", { name: "abrir câmera" }));
    expect(document.title).toBe("Avia | Câmera");

    await user.click(screen.getByRole("button", { name: "capturar" }));
    await screen.findByTestId("resultado");
    expect(document.title).toBe("Avia | Resultado");
  });
});
