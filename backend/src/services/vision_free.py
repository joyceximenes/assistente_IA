from __future__ import annotations

import io
from typing import Any

import httpx
from PIL import Image

from src.core.config import settings

OCR_SPACE_URL = "https://api.ocr.space/parse/image"
HUGGINGFACE_OBJECT_DETECTION_URL = "https://router.huggingface.co/hf-inference/models/facebook/detr-resnet-50"

_TIMEOUT = httpx.Timeout(30.0)


class VisionProviderError(RuntimeError):
    """Erro controlado dos provedores de visão (OCR.space + Hugging Face)."""


def analyze_with_free_apis(image_bytes: bytes) -> dict[str, Any]:
    """
    Substitui o Google Vision por duas APIs gratuitas, sem cartão de crédito:
    - OCR.space: reconhecimento de texto (equivalente ao TEXT_DETECTION)
    - Hugging Face Inference API (facebook/detr-resnet-50): detecção de objetos
      com caixa delimitadora (equivalente a LABEL_DETECTION + OBJECT_LOCALIZATION)

    Retorna o mesmo formato que decision.py já espera: text_annotations, labels,
    objects (com normalized_vertices) e raw.
    """
    text_annotations = _ocr_space(image_bytes)
    objects, labels = _huggingface_object_detection(image_bytes)

    return {
        "text_annotations": text_annotations,
        "labels": labels,
        "objects": objects,
        "raw": {
            "text_count": len(text_annotations),
            "label_count": len(labels),
            "object_count": len(objects),
        },
    }


def _ocr_space(image_bytes: bytes) -> list[dict[str, Any]]:
    if not settings.ocr_space_api_key:
        raise VisionProviderError("OCR_SPACE_API_KEY não configurada.")

    try:
        response = httpx.post(
            OCR_SPACE_URL,
            headers={"apikey": settings.ocr_space_api_key},
            data={"language": "por", "OCREngine": "2", "scale": "true"},
            files={"file": ("image.jpg", image_bytes, "image/jpeg")},
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as e:
        raise VisionProviderError(f"OCR.space call error: {e}") from e
    except Exception as e:
        raise VisionProviderError(f"Unexpected OCR.space error: {e}") from e

    if payload.get("IsErroredOnProcessing"):
        mensagem = payload.get("ErrorMessage") or ["erro desconhecido"]
        raise VisionProviderError(f"OCR.space error: {'; '.join(mensagem)}")

    parsed_results = payload.get("ParsedResults") or []
    texto = "\n".join(r.get("ParsedText", "") for r in parsed_results).strip()
    if not texto:
        return []
    return [{"description": texto, "locale": "por"}]


def _huggingface_object_detection(
    image_bytes: bytes,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not settings.huggingface_api_token:
        raise VisionProviderError("HUGGINGFACE_API_TOKEN não configurada.")

    try:
        width, height = Image.open(io.BytesIO(image_bytes)).size
    except Exception as e:
        raise VisionProviderError(f"Não foi possível ler a imagem: {e}") from e

    try:
        response = httpx.post(
            HUGGINGFACE_OBJECT_DETECTION_URL,
            headers={
                "Authorization": f"Bearer {settings.huggingface_api_token}",
                "Content-Type": "image/jpeg",
            },
            content=image_bytes,
            timeout=_TIMEOUT,
        )
    except httpx.HTTPError as e:
        raise VisionProviderError(f"Hugging Face call error: {e}") from e

    if response.status_code == 503:
        raise VisionProviderError(
            "Hugging Face error: modelo ainda carregando (cold start do free tier). "
            "Tente novamente em alguns segundos."
        )
    try:
        response.raise_for_status()
        deteccoes = response.json()
    except httpx.HTTPError as e:
        raise VisionProviderError(f"Hugging Face call error: {e}") from e
    except Exception as e:
        raise VisionProviderError(f"Unexpected Hugging Face error: {e}") from e

    if isinstance(deteccoes, dict) and "error" in deteccoes:
        raise VisionProviderError(f"Hugging Face error: {deteccoes['error']}")

    objects: list[dict[str, Any]] = []
    melhores_scores: dict[str, float] = {}
    for det in deteccoes or []:
        name = (det.get("label") or "").strip()
        score = float(det.get("score", 0.0) or 0.0)
        box = det.get("box") or {}
        if not name:
            continue

        melhores_scores[name] = max(melhores_scores.get(name, 0.0), score)

        xmin = float(box.get("xmin", 0.0)) / width
        xmax = float(box.get("xmax", 0.0)) / width
        ymin = float(box.get("ymin", 0.0)) / height
        ymax = float(box.get("ymax", 0.0)) / height
        objects.append(
            {
                "name": name,
                "score": score,
                "normalized_vertices": [
                    {"x": xmin, "y": ymin},
                    {"x": xmax, "y": ymin},
                    {"x": xmax, "y": ymax},
                    {"x": xmin, "y": ymax},
                ],
            }
        )

    labels = [{"description": name, "score": score} for name, score in melhores_scores.items()]
    return objects, labels
