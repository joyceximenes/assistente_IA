/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // permite acessar pelo IP da máquina (bom pra testar no celular)
    port: 5173,
  },
  test: {
    // jsdom porque quase tudo aqui depende de APIs de navegador
    // (speechSynthesis, navigator.vibrate, fetch, DOM do React)
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/main.tsx", "src/vite-env.d.ts"],
    },
  },
});
