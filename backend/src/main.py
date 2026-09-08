from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router as api_router
from src.core.config import settings
from src.core.logging import setup_logging

setup_logging()

app = FastAPI(
    title="TCC Assistente Visual API",
    version="0.1.0",
)

# Origens liberadas vêm de CORS_ALLOWED_ORIGINS (settings.cors_allowed_origins).
# Em produção, essa variável de ambiente deve incluir o domínio do frontend publicado.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
