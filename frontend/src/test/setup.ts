import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Desmonta a árvore entre testes: o Result dispara fala/microfone ao montar,
// e sem cleanup o fluxo de um teste vaza para o seguinte.
afterEach(() => {
  cleanup();
});
