from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from src.core.config import settings


@dataclass
class VisionTextResult:
    full_text: str
    confidence: float  # 0..1 (aproximação; Vision não dá confiança direta do texto completo)


@dataclass
class VisionLabel:
    description: str
    score: float  # 0..1


@dataclass
class VisionResult:
    text: Optional[VisionTextResult]
    labels: List[VisionLabel]
    raw: Optional[Dict[str, Any]]


class VisionProviderError(RuntimeError):
    pass


def _build_client():
    """
    Cria o cliente do Google Vision.
    Usa ADC (Application Default Credentials). Se GOOGLE_APPLICATION_CREDENTIALS
    estiver setado, o SDK usa automaticamente.
    """
    try:
        from google.cloud import vision  # type: ignore
    except Exception as e:
        raise VisionProviderError(
            "Dependência ausente: instale `google-cloud-vision` no backend."
        ) from e

    # ADC: se settings.google_credentials_path estiver setado no env como
    # GOOGLE_APPLICATION_CREDENTIALS, o Google SDK já encontra.
    return vision.ImageAnnotatorClient()


def analyze_with_google_vision(image_bytes: bytes) -> VisionResult:
    """
    Faz OCR + labels via Google Vision e retorna um resultado estruturado.
    """
    if not image_bytes:
        raise ValueError("image_bytes vazio.")

    client = _build_client()

    try:
        from google.cloud import vision  # type: ignore
    except Exception as e:
        raise VisionProviderError("Falha ao importar google.cloud.vision.") from e

    image = vision.Image(content=image_bytes)

    # IMPORTANTE: request único com múltiplas features (mais eficiente)
    features = [
        {"type_": vision.Feature.Type.DOCUMENT_TEXT_DETECTION},
        {"type_": vision.Feature.Type.LABEL_DETECTION},
    ]

    try:
        response = client.annotate_image({"image": image, "features": features})
    except Exception as e:
        raise VisionProviderError("Erro chamando Google Vision API.") from e

    if response.error and response.error.message:
        raise VisionProviderError(f"Google Vision retornou erro: {response.error.message}")

    # ----- Texto (OCR) -----
    text_value = ""
    # DOCUMENT_TEXT_DETECTION geralmente preenche full_text_annotation.text
    if getattr(response, "full_text_annotation", None) and response.full_text_annotation.text:
        text_value = response.full_text_annotation.text.strip()
    elif getattr(response, "text_annotations", None):
        # fallback: text_annotations[0].description costuma ser o texto completo
        if len(response.text_annotations) > 0 and response.text_annotations[0].description:
            text_value = response.text_annotations[0].description.strip()

    text_result: Optional[VisionTextResult] = None
    if text_value:
        # A Vision API não expõe uma confiança única do texto completo.
        # Para manter o contrato, usamos uma confiança aproximada.
        # (Depois podemos calcular com base em blocos/paragraphs/words se quiser.)
        text_result = VisionTextResult(full_text=text_value, confidence=0.85)

    # ----- Labels / “objetos” (LABEL_DETECTION) -----
    labels: List[VisionLabel] = []
    if getattr(response, "label_annotations", None):
        for lab in response.label_annotations:
            desc = (lab.description or "").strip()
            score = float(lab.score or 0.0)
            if desc:
                labels.append(VisionLabel(description=desc, score=score))

    # ----- Raw (debug) -----
    raw: Optional[Dict[str, Any]] = None
    if settings.return_raw_provider_response:
        # to_dict() existe nos protos; se não existir, a gente só omite
        try:
            raw = response._pb  # type: ignore[attr-defined]
            # _pb é proto interno; pode ser grande. Se preferir, depois trocamos por to_json.
            raw = {"note": "raw enabled; proto internal available", "has_full_text": bool(text_value)}
        except Exception:
            raw = {"note": "raw enabled; unable to serialize response"}

    return VisionResult(text=text_result, labels=labels, raw=raw)
