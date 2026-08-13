from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


AnalyzeType = Literal["stub", "text", "object", "unknown", "error"]


class AnalyzeMeta(BaseModel):
    filename: Optional[str] = None
    content_type: Optional[str] = None
    bytes: Optional[int] = None


class DetectedObject(BaseModel):
    """Objeto localizado na imagem, com posição na grade 3x3 para áudio."""
    name: str = Field(description="Nome original (inglês) retornado pelo Vision")
    name_pt: str = Field(description="Nome traduzido para pt-BR")
    score: float = Field(ge=0.0, le=1.0)
    position: str = Field(default="", description='Posição na grade 3x3, ex.: "no centro", "à esquerda"')


class AnalyzeResponse(BaseModel):
    """
    Resposta padrão do endpoint /analyze.
    """
    type: AnalyzeType = Field(description="Tipo de resultado")
    result: str = Field(description="Texto reconhecido ou descrição do objeto")
    confidence: float = Field(ge=0.0, le=1.0, description="Confiança de 0 a 1")
    objects: List[DetectedObject] = Field(
        default_factory=list,
        description="Objetos localizados com posição na grade 3x3",
    )
    meta: Optional[AnalyzeMeta] = None
    raw: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Resposta crua do provedor (Google Vision) para debug",
    )
