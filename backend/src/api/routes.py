from typing import Annotated

from fastapi import APIRouter, UploadFile, File, HTTPException

from src.api.schemas import AnalyzeResponse, AnalyzeMeta, DetectedObject
from src.core.config import settings
from src.services.image_io import (
    ImageValidationError,
    validate_upload_size,
    normalize_image,
)
from src.services.vision_google import analyze_with_google_vision, VisionProviderError
from src.services.decision import decide_text_or_object

router = APIRouter()

@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/analyze")
def analyze(image: Annotated[UploadFile, File()]) -> AnalyzeResponse:
    # 1) validar tipo de arquivo
    if image.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=415,
            detail=f"Formato não suportado: {image.content_type}. Use JPEG, PNG ou WEBP.",
        )

    # 2) ler bytes (rota síncrona: normalize_image() e a chamada ao Vision são
    # bloqueantes; o FastAPI roda rotas "def" comuns numa threadpool, então o
    # event loop nunca trava esperando por elas)
    data = image.file.read()

    # 3) validar tamanho (evita payload absurdo)
    try:
        validate_upload_size(data, max_bytes=settings.max_upload_bytes)
    except ImageValidationError as e:
        raise HTTPException(status_code=413, detail=str(e))

    # 4) normalizar (reduz custo/latência e estabiliza input)
    try:
        normalized = normalize_image(
            data,
            input_mime=image.content_type,  # type: ignore[arg-type]
            max_side_px=settings.max_image_side_px,
            output_mime="image/jpeg",
            jpeg_quality=85,
        )
    except ImageValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 5) chamar Google Vision
    try:
        vision_result = analyze_with_google_vision(normalized.bytes)
    except VisionProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # 6) decidir texto vs objeto
    decision = decide_text_or_object(vision_result)

    # 7) responder no contrato
    return AnalyzeResponse(
        type=decision.type,  # "text" | "object" | "unknown"
        result=decision.result,
        confidence=min(1.0, max(0.0, decision.confidence)),
        objects=[
            DetectedObject(
                name=o.name,
                name_pt=o.name_pt,
                score=min(1.0, max(0.0, o.score)),
                position=o.position,
            )
            for o in decision.objects
        ],
        meta=AnalyzeMeta(
            filename=image.filename,
            content_type=normalized.mime,
            bytes=len(normalized.bytes),
        ),
        raw=vision_result["raw"] if settings.return_raw_provider_response else None,
    )
