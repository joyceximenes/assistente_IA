import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // permite acessar pelo IP da máquina (bom pra testar no celular)
    port: 5173,
  },
});
