from typing import Any, Literal

from pydantic import BaseModel, Field

AnalyzeType = Literal["stub", "text", "object", "unknown", "error"]


class AnalyzeMeta(BaseModel):
    filename: str | None = None
    content_type: str | None = None
    bytes: int | None = None


class DetectedObject(BaseModel):
    """Objeto localizado na imagem, com posição na grade 3x3 para áudio."""

    name: str = Field(description="Nome original (inglês) retornado pelo Vision")
    name_pt: str = Field(description="Nome traduzido para pt-BR")
    score: float = Field(ge=0.0, le=1.0)
    position: str = Field(
        default="", description='Posição na grade 3x3, ex.: "no centro", "à esquerda"'
    )


class AnalyzeResponse(BaseModel):
    """
    Resposta padrão do endpoint /analyze.
    """

    type: AnalyzeType = Field(description="Tipo de resultado")
    result: str = Field(description="Texto reconhecido ou descrição do objeto")
    confidence: float = Field(ge=0.0, le=1.0, description="Confiança de 0 a 1")
    objects: list[DetectedObject] = Field(
        default_factory=list,
        description="Objetos localizados com posição na grade 3x3",
    )
    meta: AnalyzeMeta | None = None
    raw: dict[str, Any] | None = Field(
        default=None,
        description="Resposta crua do provedor (Google Vision) para debug",
    )
