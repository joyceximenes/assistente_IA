import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from src.api import routes
from src.core.config import settings
from src.main import app
from src.services.decision import translate_object_name
from src.services.vision_free import VisionProviderError


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_rota_health(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_rota_analyze_recusa_tipo_de_arquivo_invalido(client: TestClient):
    arquivo = {"image": ("foto.gif", b"nao-importa", "image/gif")}

    response = client.post("/analyze", files=arquivo)

    assert response.status_code == 415
    assert response.json()["detail"] == (
        "Formato não suportado: image/gif. Use JPEG, PNG ou WEBP."
    )


def test_rota_analyze_exige_o_campo_image(client: TestClient):
    response = client.post("/analyze")
    assert response.status_code == 422

def test_rota_analyze_recusa_arquivo_grande(client: TestClient):
    # Criar um arquivo de 10 MB (maior que o limite de 5 MB)
    arquivo_grande = b"a" * (10 * 1024 * 1024)  # 10 MB
    arquivo = {"image": ("foto.jpg", arquivo_grande, "image/jpeg")}

    response = client.post("/analyze", files=arquivo)

    assert response.status_code == 413


@pytest.fixture
def jpeg_pequeno() -> bytes:
    """JPEG 100x100 válido, abaixo do limite de redimensionamento."""
    img = Image.new("RGB", (100, 100), color="red")
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


def test_rota_analyze_aceita_jpeg_e_devolve_o_contrato(
    client: TestClient, jpeg_pequeno: bytes, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — os provedores de visão são substituídos por um retorno fixo.
    # Sem isso o teste bateria nas APIs externas: precisaria de chaves e o
    # resultado mudaria a cada execução.
    def vision_falso(_: bytes) -> dict:
        return {
            "text_annotations": [],
            "labels": [],
            "objects": [
                {
                    "name": "bottle",
                    "score": 0.9,
                    "normalized_vertices": [{"x": 0.5, "y": 0.5}],
                }
            ],
            "raw": {"text_count": 0, "label_count": 0, "object_count": 1},
        }

    monkeypatch.setattr(routes, "analyze_with_free_apis", vision_falso)

    arquivo = {"image": ("foto.jpg", jpeg_pequeno, "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — o contrato que o frontend consome.
    assert response.status_code == 200
    corpo = response.json()
    assert corpo["type"] == "object"
    assert corpo["objects"][0]["name_pt"] == translate_object_name("bottle")
    assert corpo["objects"][0]["position"] == "no centro"
    assert 0.0 <= corpo["confidence"] <= 1.0


def test_rota_analyze_normaliza_para_jpeg_e_registra_no_meta(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — PNG de 2000px de lado: acima do limite, então a normalização
    # precisa reduzir a imagem E converter o formato para JPEG.
    img = Image.new("RGB", (2000, 2000), color="blue")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    png_grande = buffer.getvalue()

    def vision_falso(imagem_bytes: bytes) -> dict:
        # O que chega no Vision já passou pela normalização: guardamos para
        # conferir que o redimensionamento aconteceu de fato.
        recebido = Image.open(io.BytesIO(imagem_bytes))
        assert max(recebido.size) <= settings.max_image_side_px
        assert recebido.format == "JPEG"
        return {
            "text_annotations": [],
            "labels": [],
            "objects": [],
            "raw": {"text_count": 0, "label_count": 0, "object_count": 0},
        }

    monkeypatch.setattr(routes, "analyze_with_free_apis", vision_falso)

    arquivo = {"image": ("foto.png", png_grande, "image/png")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — o meta reporta o formato normalizado, não o original.
    assert response.status_code == 200
    meta = response.json()["meta"]
    assert meta["filename"] == "foto.png"
    assert meta["content_type"] == "image/jpeg"
    assert meta["bytes"] < len(png_grande)


def test_rota_analyze_devolve_400_quando_a_imagem_nao_abre(client: TestClient):
    # Arrange — content_type aceito, mas o conteúdo não é uma imagem de verdade.
    # É o caso do arquivo corrompido ou renomeado para .jpg. Não precisa de mock:
    # normalize_image falha sozinho, antes de qualquer chamada ao Vision.
    arquivo = {"image": ("foto.jpg", b"isto nao e uma imagem", "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — o ImageValidationError vira 400, não 500, e a mensagem do
    # domínio chega intacta ao frontend.
    assert response.status_code == 400
    assert response.json()["detail"] == "Não foi possível abrir a imagem enviada."


def test_rota_analyze_devolve_502_quando_o_vision_falha(
    client: TestClient, jpeg_pequeno: bytes, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — imagem válida, mas o provedor externo está fora do ar ou sem
    # cota. Simulamos a falha para não depender da API real.
    def vision_quebrado(_: bytes) -> dict:
        raise VisionProviderError("Vision error: quota exceeded")

    monkeypatch.setattr(routes, "analyze_with_free_apis", vision_quebrado)

    arquivo = {"image": ("foto.jpg", jpeg_pequeno, "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — 502 Bad Gateway: a culpa é do provedor, não do usuário.
    assert response.status_code == 502
    assert response.json()["detail"] == "Vision error: quota exceeded"


# --- helpers para os cenários de decisão -------------------------------------


def _resposta_vision(*, texts=None, labels=None, objects=None) -> dict:
    """Monta o dicionário no formato que analyze_with_free_apis devolve."""
    texts = texts or []
    labels = labels or []
    objects = objects or []
    return {
        "text_annotations": texts,
        "labels": labels,
        "objects": objects,
        "raw": {
            "text_count": len(texts),
            "label_count": len(labels),
            "object_count": len(objects),
        },
    }


def _usar_vision_falso(monkeypatch: pytest.MonkeyPatch, resposta: dict) -> None:
    monkeypatch.setattr(routes, "analyze_with_free_apis", lambda _: resposta)


# --- os três tipos de decisão que a rota pode devolver ------------------------


def test_rota_analyze_devolve_texto_quando_ha_ocr(
    client: TestClient, jpeg_pequeno: bytes, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — placa de rua fotografada: o Vision devolve OCR.
    _usar_vision_falso(
        monkeypatch,
        _resposta_vision(texts=[{"description": "  Rua Coronel Magalhães\n"}]),
    )
    arquivo = {"image": ("foto.jpg", jpeg_pequeno, "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — texto ganha de qualquer outra pista, e chega limpo para o TTS.
    corpo = response.json()
    assert response.status_code == 200
    assert corpo["type"] == "text"
    assert corpo["result"] == "Rua Coronel Magalhães"


def test_rota_analyze_devolve_desconhecido_quando_o_vision_nao_ve_nada(
    client: TestClient, jpeg_pequeno: bytes, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — foto tremida ou de uma parede branca: o Vision responde vazio.
    _usar_vision_falso(monkeypatch, _resposta_vision())
    arquivo = {"image": ("foto.jpg", jpeg_pequeno, "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — 200, não erro: a requisição funcionou, só não houve o que dizer.
    corpo = response.json()
    assert response.status_code == 200
    assert corpo["type"] == "unknown"
    assert corpo["confidence"] == 0.0
    assert corpo["objects"] == []


def test_rota_analyze_usa_label_quando_nao_ha_texto_nem_objeto_localizado(
    client: TestClient, jpeg_pequeno: bytes, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — só labels gerais, sem bounding box.
    _usar_vision_falso(
        monkeypatch, _resposta_vision(labels=[{"description": "bottle", "score": 0.7}])
    )
    arquivo = {"image": ("foto.jpg", jpeg_pequeno, "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — descreve o objeto, mas sem posição na grade.
    corpo = response.json()
    assert corpo["type"] == "object"
    assert corpo["result"] == translate_object_name("bottle")
    assert corpo["objects"] == []


# --- o contrato de confiança (0.0 a 1.0) --------------------------------------


def test_rota_analyze_limita_confidence_acima_de_um(
    client: TestClient, jpeg_pequeno: bytes, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — score fora da faixa, como se o provedor mudasse a escala.
    _usar_vision_falso(
        monkeypatch, _resposta_vision(labels=[{"description": "bottle", "score": 1.8}])
    )
    arquivo = {"image": ("foto.jpg", jpeg_pequeno, "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — o min/max da rota protege o AnalyzeResponse, que exige 0..1.
    # Sem o clamp, o Pydantic devolveria 500 na serialização.
    assert response.status_code == 200
    assert response.json()["confidence"] == 1.0


def test_rota_analyze_descarta_objeto_com_score_negativo(
    client: TestClient, jpeg_pequeno: bytes, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — score negativo em um objeto localizado: abaixo do limiar de
    # confiança (MIN_OBJECT_CONFIDENCE), tratado como ruído do provedor.
    _usar_vision_falso(
        monkeypatch,
        _resposta_vision(
            objects=[
                {
                    "name": "bottle",
                    "score": -0.5,
                    "normalized_vertices": [{"x": 0.5, "y": 0.5}],
                }
            ]
        ),
    )
    arquivo = {"image": ("foto.jpg", jpeg_pequeno, "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — decision.py descarta o objeto de baixa confiança antes mesmo
    # de chegar ao clamp da rota; sem outro sinal, a decisão cai em unknown.
    assert response.status_code == 200
    assert response.json()["objects"] == []
    assert response.json()["type"] == "unknown"


# --- o campo raw é controlado por configuração --------------------------------


def test_rota_analyze_omite_raw_por_padrao(
    client: TestClient, jpeg_pequeno: bytes, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — em produção o raw fica desligado (não expõe payload do provedor).
    monkeypatch.setattr(routes.settings, "return_raw_provider_response", False)
    _usar_vision_falso(monkeypatch, _resposta_vision())
    arquivo = {"image": ("foto.jpg", jpeg_pequeno, "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert
    assert response.json()["raw"] is None


def test_rota_analyze_inclui_raw_quando_a_flag_esta_ligada(
    client: TestClient, jpeg_pequeno: bytes, monkeypatch: pytest.MonkeyPatch
):
    # Arrange — a flag de debug, usada durante o desenvolvimento.
    monkeypatch.setattr(routes.settings, "return_raw_provider_response", True)
    _usar_vision_falso(
        monkeypatch, _resposta_vision(labels=[{"description": "bottle", "score": 0.7}])
    )
    arquivo = {"image": ("foto.jpg", jpeg_pequeno, "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — os contadores do provedor aparecem para depuração.
    assert response.json()["raw"] == {
        "text_count": 0,
        "label_count": 1,
        "object_count": 0,
    }


# --- os demais formatos aceitos e o arquivo vazio -----------------------------


@pytest.mark.parametrize(
    ("formato_pillow", "nome", "mime"),
    [("PNG", "foto.png", "image/png"), ("WEBP", "foto.webp", "image/webp")],
)
def test_rota_analyze_aceita_png_e_webp(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    formato_pillow: str,
    nome: str,
    mime: str,
):
    # Arrange — os outros dois formatos da lista branca da rota.
    buffer = io.BytesIO()
    Image.new("RGB", (60, 60), color="green").save(buffer, format=formato_pillow)
    _usar_vision_falso(monkeypatch, _resposta_vision())
    arquivo = {"image": (nome, buffer.getvalue(), mime)}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — todos são normalizados para JPEG antes de seguir.
    assert response.status_code == 200
    assert response.json()["meta"]["content_type"] == "image/jpeg"


def test_rota_analyze_recusa_arquivo_vazio(client: TestClient):
    # Arrange — upload que chegou sem bytes (falha de rede, câmera travada).
    arquivo = {"image": ("foto.jpg", b"", "image/jpeg")}

    # Act
    response = client.post("/analyze", files=arquivo)

    # Assert — validate_upload_size barra antes de tentar decodificar a imagem.
    assert response.status_code == 413
    assert response.json()["detail"] == "Arquivo de imagem vazio."
