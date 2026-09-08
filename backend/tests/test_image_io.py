"""
Testes de src/services/image_io.py — a etapa que prepara a foto antes de ela
sair para os provedores de visão: valida tamanho, padroniza cor, reduz resolução e
reencoda para um formato único.
"""

import io

import pytest
from PIL import Image

from src.services.image_io import (
    ImageValidationError,
    NormalizedImage,
    _resize_keep_aspect,
    normalize_image,
    validate_upload_size,
)


def _para_bytes(img: Image.Image, formato: str) -> bytes:
    buffer = io.BytesIO()
    img.save(buffer, format=formato)
    return buffer.getvalue()


def _abrir(dados: bytes) -> Image.Image:
    return Image.open(io.BytesIO(dados))


# --- validate_upload_size -----------------------------------------------------


def test_arquivo_vazio_e_rejeitado():
    # Arrange — upload que chegou sem bytes.
    dados = b""

    # Act / Assert
    with pytest.raises(ImageValidationError, match="Arquivo de imagem vazio"):
        validate_upload_size(dados, max_bytes=100)


def test_arquivo_acima_do_limite_e_rejeitado():
    # Arrange — 101 bytes contra um limite de 100.
    dados = b"a" * 101

    # Act / Assert — a mensagem cita os dois números para o usuário entender.
    with pytest.raises(ImageValidationError, match="Imagem muito grande"):
        validate_upload_size(dados, max_bytes=100)


def test_arquivo_exatamente_no_limite_passa():
    # Arrange — o limite é inclusivo: 100 bytes com máximo de 100 é válido.
    dados = b"a" * 100

    # Act / Assert — não levantar exceção é o comportamento esperado.
    assert validate_upload_size(dados, max_bytes=100) is None


# --- normalize_image: entradas que não abrem ----------------------------------


def test_arquivo_que_nao_e_imagem_vira_erro_de_dominio():
    # Arrange — bytes de texto com extensão de imagem.
    dados = b"isto nao e uma imagem"

    # Act / Assert — o erro genérico do Pillow é traduzido para o erro do
    # domínio, que a rota sabe converter em HTTP 400.
    with pytest.raises(ImageValidationError, match="Não foi possível abrir a imagem"):
        normalize_image(dados, input_mime="image/jpeg")


def test_erro_ao_abrir_preserva_a_causa_original():
    # Arrange
    dados = b"cabecalho invalido"

    # Act
    with pytest.raises(ImageValidationError) as erro:
        normalize_image(dados, input_mime="image/png")

    # Assert — o "from e" mantém a exceção do Pillow encadeada para o log,
    # sem expor o detalhe técnico ao usuário final.
    assert erro.value.__cause__ is not None


# --- normalize_image: padronização de cor -------------------------------------


def test_imagem_em_tons_de_cinza_vira_rgb():
    # Arrange — modo "L" é o grayscale do Pillow.
    cinza = Image.new("L", (50, 50), color=128)

    # Act
    resultado = normalize_image(_para_bytes(cinza, "PNG"), input_mime="image/png")

    # Assert — sem a conversão o Pillow salvaria um JPEG de 1 canal.
    assert _abrir(resultado.bytes).mode == "RGB"


def test_imagem_com_transparencia_vira_rgb():
    # Arrange — PNG com canal alpha.
    com_alpha = Image.new("RGBA", (50, 50), color=(255, 0, 0, 0))

    # Act
    resultado = normalize_image(_para_bytes(com_alpha, "PNG"), input_mime="image/png")

    # Assert — sem converter, salvar RGBA como JPEG levantaria OSError.
    assert _abrir(resultado.bytes).mode == "RGB"


def test_imagem_rgb_continua_rgb():
    # Arrange — o caso comum, que não deve sofrer nenhuma conversão.
    rgb = Image.new("RGB", (50, 50), color="red")

    # Act
    resultado = normalize_image(_para_bytes(rgb, "JPEG"), input_mime="image/jpeg")

    # Assert
    assert _abrir(resultado.bytes).mode == "RGB"


# --- normalize_image: redimensionamento ---------------------------------------


def test_imagem_menor_que_o_limite_nao_e_redimensionada():
    # Arrange — 100x80 com limite de 1280.
    pequena = Image.new("RGB", (100, 80), color="blue")

    # Act
    resultado = normalize_image(
        _para_bytes(pequena, "JPEG"), input_mime="image/jpeg", max_side_px=1280
    )

    # Assert — ampliar imagem pequena só gastaria banda sem ganhar detalhe.
    assert (resultado.width, resultado.height) == (100, 80)


def test_imagem_maior_que_o_limite_e_reduzida_mantendo_proporcao():
    # Arrange — 400x200 (proporção 2:1) com limite de 100.
    grande = Image.new("RGB", (400, 200), color="blue")

    # Act
    resultado = normalize_image(
        _para_bytes(grande, "JPEG"), input_mime="image/jpeg", max_side_px=100
    )

    # Assert — o maior lado bate no limite e a proporção se mantém.
    assert (resultado.width, resultado.height) == (100, 50)
    assert _abrir(resultado.bytes).size == (100, 50)


def test_reducao_diminui_o_tamanho_em_bytes():
    # Arrange — imagem com ruído para o JPEG não comprimir a quase nada.
    grande = Image.effect_noise((2000, 2000), 60).convert("RGB")
    original = _para_bytes(grande, "PNG")

    # Act
    resultado = normalize_image(original, input_mime="image/png", max_side_px=640)

    # Assert — é o objetivo declarado da normalização: payload menor e
    # chamada mais barata ao Vision.
    assert len(resultado.bytes) < len(original)


# --- _resize_keep_aspect: a regra de proporção isolada ------------------------


@pytest.mark.parametrize(
    ("entrada", "limite", "esperado"),
    [
        ((100, 100), 200, (100, 100)),  # menor que o limite: intocada
        ((200, 200), 200, (200, 200)),  # exatamente no limite: intocada
        ((400, 200), 100, (100, 50)),  # paisagem: o lado maior é a largura
        ((200, 400), 100, (50, 100)),  # retrato: o lado maior é a altura
        ((300, 300), 100, (100, 100)),  # quadrada
    ],
)
def test_resize_keep_aspect(entrada, limite, esperado):
    # Act / Assert — a proporção é o que garante que a foto não distorça.
    assert _resize_keep_aspect(*entrada, max_side_px=limite) == esperado


def test_resize_nunca_devolve_lado_zero():
    # Arrange — proporção extrema: 1000x1 reduzido para 10 de lado maior
    # daria altura 0.01, que arredondaria para zero.
    resultado = _resize_keep_aspect(1000, 1, max_side_px=10)

    # Assert — o max(1, ...) evita uma imagem de altura zero, que o Pillow
    # rejeitaria ao salvar.
    assert resultado == (10, 1)


# --- normalize_image: formatos de saída ---------------------------------------


@pytest.mark.parametrize(
    ("mime", "formato_pillow"),
    [
        ("image/jpeg", "JPEG"),
        ("image/png", "PNG"),
        ("image/webp", "WEBP"),
    ],
)
def test_cada_formato_de_saida_gera_o_arquivo_correspondente(mime, formato_pillow):
    # Arrange
    origem = Image.new("RGB", (40, 40), color="green")

    # Act
    resultado = normalize_image(
        _para_bytes(origem, "PNG"), input_mime="image/png", output_mime=mime
    )

    # Assert — o mime declarado tem que corresponder aos bytes de verdade.
    assert resultado.mime == mime
    assert _abrir(resultado.bytes).format == formato_pillow


def test_formato_de_saida_desconhecido_e_rejeitado():
    # Arrange — mime fora da lista suportada.
    origem = _para_bytes(Image.new("RGB", (40, 40)), "PNG")

    # Act / Assert
    with pytest.raises(ImageValidationError, match="Formato de saída não suportado"):
        normalize_image(
            origem,
            input_mime="image/png",
            output_mime="image/gif",  # type: ignore[arg-type]
        )


def test_qualidade_jpeg_afeta_o_tamanho_do_arquivo():
    # Arrange — imagem com ruído, onde a compressão realmente pesa.
    origem = _para_bytes(Image.effect_noise((300, 300), 60).convert("RGB"), "PNG")

    # Act
    alta = normalize_image(origem, input_mime="image/png", jpeg_quality=95)
    baixa = normalize_image(origem, input_mime="image/png", jpeg_quality=20)

    # Assert — o parâmetro precisa chegar até o img.save().
    assert len(baixa.bytes) < len(alta.bytes)


# --- o contrato de retorno ----------------------------------------------------


def test_retorno_descreve_a_imagem_final_e_nao_a_original():
    # Arrange — 400x200 PNG que será reduzido e convertido.
    origem = _para_bytes(Image.new("RGB", (400, 200), color="blue"), "PNG")

    # Act
    resultado = normalize_image(origem, input_mime="image/png", max_side_px=100)

    # Assert — quem consome o NormalizedImage (a rota, no campo meta) precisa
    # dos dados de saída, não dos de entrada.
    assert isinstance(resultado, NormalizedImage)
    assert resultado.mime == "image/jpeg"
    assert (resultado.width, resultado.height) == (100, 50)
    assert _abrir(resultado.bytes).size == (resultado.width, resultado.height)
