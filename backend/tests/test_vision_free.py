"""
Testes de src/services/vision_free.py — a fronteira com o OCR.space e a
Hugging Face Inference API (substitutos gratuitos do Google Vision).

Nenhum teste aqui toca as APIs reais: httpx.post é substituído por um dublê,
o que deixa a suíte rápida, gratuita e determinística.
"""

import io

import httpx
import pytest
from PIL import Image

from src.core.config import settings
from src.services import vision_free
from src.services.vision_free import VisionProviderError, analyze_with_free_apis


@pytest.fixture(autouse=True)
def chaves_configuradas(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ocr_space_api_key", "chave-ocr-falsa")
    monkeypatch.setattr(settings, "huggingface_api_token", "token-hf-falso")


@pytest.fixture
def imagem_100x50() -> bytes:
    """PNG com dimensões conhecidas — necessário para checar a normalização das boxes."""
    img = Image.new("RGB", (100, 50), color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


class _RespostaFalsa:
    def __init__(self, *, status_code: int = 200, json_data=None):
        self.status_code = status_code
        self._json_data = json_data

    def json(self):
        return self._json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("erro http", request=None, response=self)


def _mock_post(monkeypatch: pytest.MonkeyPatch, *, ocr_resposta=None, hf_resposta=None):
    """Substitui httpx.post: despacha para a resposta certa conforme a URL."""

    def fake_post(url, **kwargs):
        if url == vision_free.OCR_SPACE_URL:
            return ocr_resposta or _RespostaFalsa(json_data={"ParsedResults": []})
        if url == vision_free.HUGGINGFACE_OBJECT_DETECTION_URL:
            return hf_resposta or _RespostaFalsa(json_data=[])
        raise AssertionError(f"URL inesperada: {url}")

    monkeypatch.setattr(vision_free.httpx, "post", fake_post)


# --- combinação das duas APIs ---------------------------------------------------


def test_combina_texto_e_objetos_das_duas_apis(monkeypatch, imagem_100x50):
    _mock_post(
        monkeypatch,
        ocr_resposta=_RespostaFalsa(
            json_data={"ParsedResults": [{"ParsedText": "Rua Coronel Magalhães"}]}
        ),
        hf_resposta=_RespostaFalsa(
            json_data=[{"label": "bottle", "score": 0.9, "box": {"xmin": 10, "ymin": 5, "xmax": 50, "ymax": 25}}]
        ),
    )

    resultado = analyze_with_free_apis(imagem_100x50)

    assert resultado["text_annotations"] == [
        {"description": "Rua Coronel Magalhães", "locale": "por"}
    ]
    assert resultado["objects"] == [
        {
            "name": "bottle",
            "score": 0.9,
            "normalized_vertices": [
                {"x": 0.1, "y": 0.1},
                {"x": 0.5, "y": 0.1},
                {"x": 0.5, "y": 0.5},
                {"x": 0.1, "y": 0.5},
            ],
        }
    ]
    assert resultado["labels"] == [{"description": "bottle", "score": 0.9}]
    assert resultado["raw"] == {"text_count": 1, "label_count": 1, "object_count": 1}


def test_texto_em_branco_vira_lista_vazia(monkeypatch, imagem_100x50):
    _mock_post(
        monkeypatch,
        ocr_resposta=_RespostaFalsa(json_data={"ParsedResults": [{"ParsedText": "   "}]}),
    )

    resultado = analyze_with_free_apis(imagem_100x50)

    assert resultado["text_annotations"] == []


def test_labels_dedup_mantem_o_maior_score(monkeypatch, imagem_100x50):
    _mock_post(
        monkeypatch,
        hf_resposta=_RespostaFalsa(
            json_data=[
                {"label": "bottle", "score": 0.4, "box": {"xmin": 0, "ymin": 0, "xmax": 10, "ymax": 10}},
                {"label": "bottle", "score": 0.9, "box": {"xmin": 5, "ymin": 5, "xmax": 15, "ymax": 15}},
            ]
        ),
    )

    resultado = analyze_with_free_apis(imagem_100x50)

    assert resultado["labels"] == [{"description": "bottle", "score": 0.9}]
    assert len(resultado["objects"]) == 2  # cada detecção continua com sua própria box


# --- um provedor falha: a análise segue com o outro ------------------------------

_OCR_COM_TEXTO = {"ParsedResults": [{"ParsedText": "LEITE INTEGRAL"}]}
_HF_COM_GARRAFA = [{"label": "bottle", "score": 0.9, "box": {"xmin": 10, "ymin": 5, "xmax": 50, "ymax": 25}}]
_OCR_COM_ERRO = {"IsErroredOnProcessing": True, "ErrorMessage": ["Bad image data"]}


@pytest.mark.parametrize(
    ("hf_resposta", "mensagem"),
    [
        (_RespostaFalsa(status_code=503), "cold start"),
        (_RespostaFalsa(status_code=402), "Hugging Face call error"),  # cota do mês esgotada
        (_RespostaFalsa(status_code=401), "Hugging Face call error"),  # token inválido
        (_RespostaFalsa(json_data={"error": "modelo indisponível"}), "modelo indisponível"),
    ],
)
def test_falha_do_hf_mantem_o_texto_do_ocr(monkeypatch, imagem_100x50, hf_resposta, mensagem):
    _mock_post(monkeypatch, ocr_resposta=_RespostaFalsa(json_data=_OCR_COM_TEXTO), hf_resposta=hf_resposta)

    resultado = analyze_with_free_apis(imagem_100x50)

    assert resultado["text_annotations"] == [{"description": "LEITE INTEGRAL", "locale": "por"}]
    assert resultado["objects"] == []
    assert resultado["labels"] == []
    assert len(resultado["raw"]["provider_errors"]) == 1
    assert mensagem in resultado["raw"]["provider_errors"][0]


def test_token_hf_ausente_mantem_o_texto_do_ocr(monkeypatch, imagem_100x50):
    _mock_post(monkeypatch, ocr_resposta=_RespostaFalsa(json_data=_OCR_COM_TEXTO))
    monkeypatch.setattr(settings, "huggingface_api_token", None)

    resultado = analyze_with_free_apis(imagem_100x50)

    assert resultado["text_annotations"] != []
    assert "HUGGINGFACE_API_TOKEN" in resultado["raw"]["provider_errors"][0]


def test_falha_do_ocr_mantem_os_objetos_do_hf(monkeypatch, imagem_100x50):
    _mock_post(
        monkeypatch,
        ocr_resposta=_RespostaFalsa(json_data=_OCR_COM_ERRO),
        hf_resposta=_RespostaFalsa(json_data=_HF_COM_GARRAFA),
    )

    resultado = analyze_with_free_apis(imagem_100x50)

    assert resultado["text_annotations"] == []
    assert [o["name"] for o in resultado["objects"]] == ["bottle"]
    assert "OCR.space error: Bad image data" in resultado["raw"]["provider_errors"][0]


def test_chave_ocr_ausente_mantem_os_objetos_do_hf(monkeypatch, imagem_100x50):
    _mock_post(monkeypatch, hf_resposta=_RespostaFalsa(json_data=_HF_COM_GARRAFA))
    monkeypatch.setattr(settings, "ocr_space_api_key", None)

    resultado = analyze_with_free_apis(imagem_100x50)

    assert len(resultado["objects"]) == 1
    assert "OCR_SPACE_API_KEY" in resultado["raw"]["provider_errors"][0]


def test_sem_falha_nao_ha_provider_errors(monkeypatch, imagem_100x50):
    _mock_post(monkeypatch)

    resultado = analyze_with_free_apis(imagem_100x50)

    assert "provider_errors" not in resultado["raw"]


# --- os dois falham: aí sim a análise vira erro --------------------------------


def test_falha_de_rede_nos_dois_vira_erro_de_dominio(monkeypatch, imagem_100x50):
    def post_que_falha(url, **kwargs):
        raise httpx.ConnectError("sem conexão")

    monkeypatch.setattr(vision_free.httpx, "post", post_que_falha)

    with pytest.raises(VisionProviderError, match="OCR.space call error.*Hugging Face call error"):
        analyze_with_free_apis(imagem_100x50)


def test_erro_nos_dois_provedores_vira_erro_de_dominio(monkeypatch, imagem_100x50):
    _mock_post(
        monkeypatch,
        ocr_resposta=_RespostaFalsa(json_data=_OCR_COM_ERRO),
        hf_resposta=_RespostaFalsa(status_code=402),
    )

    with pytest.raises(VisionProviderError, match="Bad image data"):
        analyze_with_free_apis(imagem_100x50)
