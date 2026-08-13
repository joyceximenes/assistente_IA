from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router as api_router
from src.core.logging import setup_logging

setup_logging()

app = FastAPI(
    title="TCC Assistente Visual API",
    version="0.1.0",
)

# Para desenvolvimento: liberar o frontend local (Vite) e acesso via IP da rede.
# Em produção, você restringe para o domínio do seu site.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # opcional: se você acessar o frontend via IP na rede
        # "http://192.168.0.10:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
