import logging
import os


def setup_logging() -> None:
    """
    Configura logging básico para o projeto.
    Pode ser chamado uma vez no startup do FastAPI.
    """
    level = os.getenv("LOG_LEVEL", "INFO").upper()

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
