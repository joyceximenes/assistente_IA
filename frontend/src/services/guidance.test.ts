import { describe, expect, it } from "vitest";
import { analyzeFrameForGuidance } from "./guidance";

const W = 32;
const H = 32;

// Constrói um ImageData sintético a partir de uma função de luminância.
// Usa objeto simples em vez do construtor ImageData: o algoritmo só lê
// `data`, `width` e `height`, e assim o teste não depende do jsdom.
function frame(lum: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = lum(x, y);
      const i = (y * W + x) * 4;
      // r = g = b faz a luminância ponderada devolver exatamente v
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H } as ImageData;
}

// Cinza uniforme: laplaciano e gradiente zerados em todo o frame.
const uniform = (v: number) => frame(() => v);

// Listras verticais de 1px alternando ±a em torno de 128.
// Propriedade útil: o laplaciano fica em ∓4a (variância alta = "nítido"),
// mas gx = right - left = 0 porque os vizinhos horizontais são iguais entre si.
// É o único jeito de isolar edgeScore baixo sem cair antes no corte de blur.
const verticalStripes = (a: number) => frame((x) => 128 + (x % 2 === 0 ? a : -a));

// Faixas horizontais de 2px de altura alternando entre A e B (padrão y%4).
// Nesse padrão |gy| = D em todo pixel interior, então edgeScore == D exatamente,
// e o laplaciano fica em ±D, o que dá blurScore == D².
const horizontalBands = (a: number, b: number) => frame((_x, y) => (y % 4 < 2 ? a : b));

describe("analyzeFrameForGuidance", () => {
  describe("brilho", () => {
    it("pede mais luz quando o frame está muito escuro", () => {
      const g = analyzeFrameForGuidance(uniform(10));

      expect(g.ok).toBe(false);
      expect(g.message).toMatch(/escuro/i);
      expect(g.brightnessScore).toBeCloseTo(10, 5);
    });

    it("avisa de reflexo quando o frame está saturado", () => {
      const g = analyzeFrameForGuidance(uniform(250));

      expect(g.ok).toBe(false);
      expect(g.message).toMatch(/luz excessiva/i);
    });

    it("checa brilho antes de blur: frame escuro E borrado reclama do escuro", () => {
      // uniform(10) também tem blurScore 0, mas o brilho é verificado primeiro
      const g = analyzeFrameForGuidance(uniform(10));

      expect(g.message).toMatch(/escuro/i);
      expect(g.blurScore).toBeLessThan(120);
    });
  });

  describe("foco", () => {
    it("pede firmeza quando não há variância de laplaciano (frame chapado)", () => {
      const g = analyzeFrameForGuidance(uniform(128));

      expect(g.ok).toBe(false);
      expect(g.message).toMatch(/firme|foco/i);
      expect(g.blurScore).toBeCloseTo(0, 5);
    });
  });

  describe("distância", () => {
    it("pede para aproximar quando há pouca borda", () => {
      // listras verticais: nítido (blur ≈ 16a² = 1600) porém edgeScore = 0
      const g = analyzeFrameForGuidance(verticalStripes(10));

      expect(g.blurScore).toBeGreaterThan(120);
      expect(g.edgeScore).toBeLessThan(18);
      expect(g.ok).toBe(false);
      expect(g.message).toMatch(/aproxime/i);
    });

    it("pede para afastar quando há borda demais", () => {
      // D = 100 => edgeScore 100 (> 55), blurScore 10000
      const g = analyzeFrameForGuidance(horizontalBands(80, 180));

      expect(g.edgeScore).toBeCloseTo(100, 5);
      expect(g.ok).toBe(false);
      expect(g.message).toMatch(/afaste/i);
    });
  });

  describe("enquadramento aceito", () => {
    it("libera a captura quando brilho, foco e borda estão na faixa", () => {
      // D = 30 => edgeScore 30 (entre 18 e 55), blurScore 900, brilho 125
      const g = analyzeFrameForGuidance(horizontalBands(110, 140));

      expect(g.brightnessScore).toBeCloseTo(125, 5);
      expect(g.blurScore).toBeCloseTo(900, 5);
      expect(g.edgeScore).toBeCloseTo(30, 5);
      expect(g.ok).toBe(true);
      expect(g.message).toMatch(/pode capturar/i);
    });
  });

  describe("contrato de retorno", () => {
    it("devolve sempre os três scores, inclusive quando reprova o frame", () => {
      const g = analyzeFrameForGuidance(uniform(10));

      expect(g).toEqual({
        ok: expect.any(Boolean),
        message: expect.any(String),
        blurScore: expect.any(Number),
        edgeScore: expect.any(Number),
        brightnessScore: expect.any(Number),
      });
    });

    it("não devolve NaN em nenhum score", () => {
      const g = analyzeFrameForGuidance(horizontalBands(110, 140));

      expect(Number.isNaN(g.blurScore)).toBe(false);
      expect(Number.isNaN(g.edgeScore)).toBe(false);
      expect(Number.isNaN(g.brightnessScore)).toBe(false);
    });
  });
});
