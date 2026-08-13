from __future__ import annotations

from typing import Any, Dict, List, Optional

from google.cloud import vision
from google.api_core import exceptions as gexc


class VisionProviderError(RuntimeError):
    """Erro controlado do provedor de visão (Google Vision)."""


_client: Optional[vision.ImageAnnotatorClient] = None


def _get_client() -> vision.ImageAnnotatorClient:
    """
    Cria o client uma vez (lazy singleton) para não recriar a cada request.
    Usa GOOGLE_APPLICATION_CREDENTIALS automaticamente.
    """
    global _client
    if _client is None:
        _client = vision.ImageAnnotatorClient()
    return _client


def analyze_with_google_vision(image_bytes: bytes) -> Dict[str, Any]:
    """
    Executa OCR (text_detection), labels (label_detection) e localização de
    objetos (object_localization) em UMA única chamada à API — menor latência
    e mesma cobrança por feature.
    Retorna dados simples (serializáveis) para o decision.py decidir.
    """
    try:
        client = _get_client()
        image = vision.Image(content=image_bytes)

        request = vision.AnnotateImageRequest(
            image=image,
            features=[
                vision.Feature(type_=vision.Feature.Type.TEXT_DETECTION),
                vision.Feature(type_=vision.Feature.Type.LABEL_DETECTION, max_results=5),
                vision.Feature(type_=vision.Feature.Type.OBJECT_LOCALIZATION, max_results=10),
            ],
        )
        response = client.annotate_image(request=request)

        if response.error and response.error.message:
            raise VisionProviderError(f"Vision error: {response.error.message}")

        # Transformar para estruturas simples (serializáveis) — evita carregar objetos protobuf no response
        text_annotations: List[Dict[str, Any]] = []
        for ann in (response.text_annotations or []):
            text_annotations.append(
                {
                    "description": getattr(ann, "description", ""),
                    "locale": getattr(ann, "locale", None),
                    "bounding_poly": _bounding_poly_to_dict(getattr(ann, "bounding_poly", None)),
                }
            )

        labels: List[Dict[str, Any]] = []
        for lab in (response.label_annotations or []):
            labels.append(
                {
                    "description": getattr(lab, "description", ""),
                    "score": float(getattr(lab, "score", 0.0) or 0.0),
                    "topicality": float(getattr(lab, "topicality", 0.0) or 0.0),
                }
            )

        # Objetos localizados: vêm com bounding box NORMALIZADA (0..1),
        # o que permite calcular a posição na grade 3x3 sem saber a resolução.
        objects: List[Dict[str, Any]] = []
        for obj in (response.localized_object_annotations or []):
            vertices = [
                {"x": float(getattr(v, "x", 0.0) or 0.0), "y": float(getattr(v, "y", 0.0) or 0.0)}
                for v in (getattr(obj.bounding_poly, "normalized_vertices", []) or [])
            ]
            objects.append(
                {
                    "name": getattr(obj, "name", ""),
                    "score": float(getattr(obj, "score", 0.0) or 0.0),
                    "normalized_vertices": vertices,
                }
            )

        return {
            "text_annotations": text_annotations,   # OCR detalhado (inclui bounding boxes)
            "labels": labels,                       # labels gerais com score
            "objects": objects,                     # objetos localizados (box normalizada)
            "raw": {
                # opcional: mantenha pouco para debug (evite gigantismo)
                "text_count": len(text_annotations),
                "label_count": len(labels),
                "object_count": len(objects),
            },
        }

    except VisionProviderError:
        raise
    except gexc.GoogleAPICallError as e:
        # Erros de rede/quotas/permissão/serviço
        raise VisionProviderError(f"Google Vision API call error: {e}") from e
    except Exception as e:
        raise VisionProviderError(f"Unexpected vision error: {e}") from e


def _bounding_poly_to_dict(bpoly: Any) -> Optional[Dict[str, Any]]:
    if not bpoly:
        return None
    vertices = []
    for v in getattr(bpoly, "vertices", []) or []:
        vertices.append({"x": getattr(v, "x", None), "y": getattr(v, "y", None)})
    return {"vertices": vertices}
