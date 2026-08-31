import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vibrate, vibrateCapture, vibrateError, vibrateReady, vibrateResult } from "./haptics";

let calls: (number | number[])[] = [];

function installVibrate(impl?: () => void) {
  calls = [];
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    writable: true,
    value: (pattern: number | number[]) => {
      calls.push(pattern);
      impl?.();
      return true;
    },
  });
}

function removeVibrate() {
  // precisa sumir de verdade: haptics.ts checa com `"vibrate" in navigator`
  delete (navigator as unknown as Record<string, unknown>).vibrate;
}

beforeEach(() => {
  installVibrate();
});

afterEach(() => {
  removeVibrate();
  vi.restoreAllMocks();
});

describe("vibrate", () => {
  it("repassa o padrão para navigator.vibrate", () => {
    vibrate([10, 20, 30]);

    expect(calls).toEqual([[10, 20, 30]]);
  });

  it("não faz nada quando o dispositivo não suporta vibração (iOS)", () => {
    removeVibrate();

    expect(() => vibrate(50)).not.toThrow();
  });

  it("engole exceção do navegador em vez de derrubar o fluxo de fala", () => {
    installVibrate(() => {
      throw new Error("NotAllowedError");
    });

    expect(() => vibrate(50)).not.toThrow();
  });
});

describe("padrões por evento", () => {
  // O padrão é o canal de informação: cada evento precisa ser distinguível
  // pelo tato, já que o usuário não vê a tela.
  it("cada evento tem um padrão próprio e distinto dos demais", () => {
    vibrateReady();
    vibrateCapture();
    vibrateResult();
    vibrateError();

    expect(calls).toEqual([90, [40, 60, 40], 60, [150, 80, 150, 80, 150]]);

    const assinaturas = calls.map((c) => JSON.stringify(c));
    expect(new Set(assinaturas).size).toBe(calls.length);
  });

  it("o erro é o padrão mais longo, para não ser confundido com sucesso", () => {
    vibrateResult();
    vibrateError();

    const duracao = (p: number | number[]) => (Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p);
    expect(duracao(calls[1])).toBeGreaterThan(duracao(calls[0]));
  });
});
