import type { AnalyzeResponse } from "../app";

const DEFAULT_BASE_URL = "http://localhost:8000";
const TIMEOUT_MS = 15_000; // 15 segundos

export function getApiBaseUrl() {
  // Define de onde vem a URL base da API.
  // Tipado em vite-env.d.ts (ImportMetaEnv) — sem cast necessário.
  return import.meta.env?.VITE_API_BASE_URL || DEFAULT_BASE_URL;
}

// Envia a imagem para o backend (Google Vision). Requer conexão com a internet.
export async function analyzeImage(blob: Blob): Promise<AnalyzeResponse> {
  if (!navigator.onLine) {
    return {
      type: "error",
      result: "Sem conexão com a internet. Conecte-se e tente novamente.",
      confidence: 0,
      meta: null,
    };
  }

  const baseUrl = getApiBaseUrl();

  const form = new FormData();
  // nome do campo tem que ser "image" porque o backend espera UploadFile = File(...)
  form.append("image", blob, "capture.jpg");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } catch {
    // timeout ou falha de rede: backend inacessível
    return {
      type: "error",
      result: "Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.",
      confidence: 0,
      meta: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let detail = `Erro ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = data.detail;
    } catch {
      // ignore
    }

    return {
      type: "error",
      result: detail,
      confidence: 0,
      meta: null,
    };
  }

  const data = (await res.json()) as AnalyzeResponse;
  return data;
}
