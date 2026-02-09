import type { AnalyzeResponse } from "../app";

const DEFAULT_BASE_URL = "http://localhost:8000";

export function getApiBaseUrl() {
  // Define de onde vem a URL base da API
  return (import.meta as any).env?.VITE_API_BASE_URL || DEFAULT_BASE_URL;
}

export async function analyzeImage(blob: Blob): Promise<AnalyzeResponse> {
  const baseUrl = getApiBaseUrl();

  const form = new FormData();
  // nome do campo tem que ser "image" porque o backend espera UploadFile = File(...)
  form.append("image", blob, "capture.jpg");

  const res = await fetch(`${baseUrl}/analyze`, {
    method: "POST",
    body: form,
  });

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
 