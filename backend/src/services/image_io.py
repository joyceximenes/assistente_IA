from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Literal

from PIL import Image  # pillow

SupportedMime = Literal["image/jpeg", "image/png", "image/webp"]


@dataclass
class NormalizedImage:
    bytes: bytes
    mime: SupportedMime
    width: int
    height: int


class ImageValidationError(ValueError):
    pass


def validate_upload_size(data: bytes, *, max_bytes: int) -> None:
    if not data:
        raise ImageValidationError("Arquivo de imagem vazio.")
    if len(data) > max_bytes:
        raise ImageValidationError(
            f"Imagem muito grande ({len(data)} bytes). Máximo permitido: {max_bytes} bytes."
        )


def normalize_image(
    data: bytes,
    *,
    input_mime: SupportedMime,
    max_side_px: int = 1280,
    output_mime: SupportedMime = "image/jpeg",
    jpeg_quality: int = 85,
) -> NormalizedImage:
    """
    Abre a imagem, corrige orientação (quando possível), redimensiona (se necessário)
    e reencoda para um formato consistente (por padrão JPEG).

    Por quê?
    - diminui payload
    - acelera chamada à Vision API
    - reduz chance de erro com arquivos estranhos
    """
    try:
        img = Image.open(io.BytesIO(data))
    except Exception as e:
        raise ImageValidationError("Não foi possível abrir a imagem enviada.") from e

    # Converte para RGB para evitar problemas com PNG com alpha ao salvar como JPEG
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        # imagem grayscale ok, mas Vision costuma ir bem com RGB; opcional
        img = img.convert("RGB")

    # Redimensiona mantendo proporção
    w, h = img.size
    new_w, new_h = _resize_keep_aspect(w, h, max_side_px=max_side_px)
    if (new_w, new_h) != (w, h):
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        w, h = new_w, new_h

    out = io.BytesIO()
    if output_mime == "image/jpeg":
        img.save(out, format="JPEG", quality=jpeg_quality, optimize=True)
    elif output_mime == "image/png":
        img.save(out, format="PNG", optimize=True)
    elif output_mime == "image/webp":
        img.save(out, format="WEBP", quality=jpeg_quality, method=6)
    else:
        raise ImageValidationError(f"Formato de saída não suportado: {output_mime}")

    out_bytes = out.getvalue()
    return NormalizedImage(bytes=out_bytes, mime=output_mime, width=w, height=h)


def _resize_keep_aspect(w: int, h: int, *, max_side_px: int) -> tuple[int, int]:
    if max(w, h) <= max_side_px:
        return w, h
    if w >= h:
        scale = max_side_px / float(w)
        return max_side_px, max(1, int(round(h * scale)))
    else:
        scale = max_side_px / float(h)
        return max(1, int(round(w * scale))), max_side_px
