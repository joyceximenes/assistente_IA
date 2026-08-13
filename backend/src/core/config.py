from pydantic import BaseModel, Field
import os


class Settings(BaseModel):
    # Ambiente
    env: str = Field(default=os.getenv("ENV", "dev"))

    # CORS (por enquanto vamos deixar no main.py, mas já guardamos aqui se quiser centralizar depois)
    # allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # Google Vision
    google_project_id: str | None = Field(default=os.getenv("GOOGLE_PROJECT_ID"))
    google_credentials_path: str | None = Field(default=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

    # Limites para o /analyze (boas práticas mesmo em protótipo)
    max_upload_bytes: int = Field(default=int(os.getenv("MAX_UPLOAD_BYTES", "5000000")))  # 5MB
    # Se quiser forçar downscale depois:
    max_image_side_px: int = Field(default=int(os.getenv("MAX_IMAGE_SIDE_PX", "1280")))

    # Debug
    return_raw_provider_response: bool = Field(
        default=os.getenv("RETURN_RAW_PROVIDER_RESPONSE", "false").lower() == "true"
    )


settings = Settings()
