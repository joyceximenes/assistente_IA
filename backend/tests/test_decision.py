"""
A função recebe o centro NORMALIZADO de um objeto (cx, cy, ambos de 0 a 1) e
devolve a posição em linguagem natural, para ser falada por voz.
"""

from src.services.decision import (
    _extract_objects,
    decide_text_or_object,
    grid_position_label,
    translate_object_name,
)


def test_centro_da_imagem_vira_no_centro():
    # Arrange — prepara a entrada.
    # 0.5 cai na faixa do meio tanto na horizontal quanto na vertical:
    # o corte da coluna/linha central é 1/3 <= valor < 2/3.
    cx = 0.5
    cy = 0.5

    # Act — executa.
    resultado = grid_position_label(cx, cy)

    # Assert — verifica.
    # Compara com a string exata: é ela que o usuário vai ouvir, então uma
    # mudança de "no centro" para "ao centro" TEM que quebrar o teste.
    assert resultado == "no centro"

def test_informa_canto_esquerdo_superior():
    cx = 0.0
    cy = 0.0

    # act + assert
    assert grid_position_label(cx, cy) == "à esquerda, na parte de cima"


def test_informa_canto_direito_superior():
    cx = 1.0
    cy = 0.0

    # act + assert
    assert grid_position_label(cx, cy) == "à direita, na parte de cima"

def test_informa_canto_esquerdo_inferior():
    cx = 0.0
    cy = 1.0

    # act + assert
    assert grid_position_label(cx, cy) == "à esquerda, na parte de baixo"

def test_informa_canto_direito_inferior():
    cx = 1.0
    cy = 1.0

    # act + assert
    assert grid_position_label(cx, cy) == "à direita, na parte de baixo"

def test_parte_de_cima():
    cx = 0.5
    cy = 0.1

    # act + assert
    assert grid_position_label(cx, cy) == "na parte de cima"

def test_parte_de_baixo():
    cx = 0.1
    cy = 0.5

    # act + assert
    assert grid_position_label(cx, cy) == "à esquerda"

def test_traduz_nome_objeto_para_pt_br():
    nome = "paper"

    resultado = translate_object_name(nome)

    assert resultado == "papel"


# ---------------------------------------------------------------------------
# _extract_objects — linhas 146-166
#
# Recebe o dicionário que veio do vision_free.py e devolve a lista de
# DetectedObjectInfo já traduzida, posicionada e ordenada.
# ---------------------------------------------------------------------------


def caixa(x0, y0, x1, y1):
    """Monta os 4 vértices normalizados de um retângulo, como o Vision devolve."""
    return [
        {"x": x0, "y": y0},
        {"x": x1, "y": y0},
        {"x": x1, "y": y1},
        {"x": x0, "y": y1},
    ]


def test_sem_a_chave_objects_devolve_lista_vazia():
    assert _extract_objects({}) == []


def test_lista_de_objetos_vazia_devolve_lista_vazia():
    assert _extract_objects({"objects": []}) == []


def test_objeto_sem_nome_e_descartado():
    vision_data = {
        "objects": [
            {"name": "", "score": 0.9, "normalized_vertices": caixa(0.4, 0.4, 0.6, 0.6)},
            {"name": "   ", "score": 0.8, "normalized_vertices": caixa(0.4, 0.4, 0.6, 0.6)},
        ]
    }

    assert _extract_objects(vision_data) == []


def test_objeto_sem_vertices_fica_sem_posicao():
    vision_data = {"objects": [{"name": "bottle", "score": 0.9}]}

    resultado = _extract_objects(vision_data)

    assert resultado[0].position == ""


def test_posicao_vem_do_centro_medio_dos_vertices():
    # caixa no canto superior esquerdo: centro médio em (0.1, 0.1)
    vision_data = {
        "objects": [{"name": "bottle", "score": 0.9, "normalized_vertices": caixa(0.0, 0.0, 0.2, 0.2)}]
    }

    resultado = _extract_objects(vision_data)

    assert resultado[0].position == "à esquerda, na parte de cima"


def test_traduz_o_nome_e_preserva_o_original():
    vision_data = {"objects": [{"name": "Bottle", "score": 0.9}]}

    resultado = _extract_objects(vision_data)

    # o nome original é mantido para rastreabilidade; o traduzido é o que se fala
    assert resultado[0].name == "Bottle"
    assert resultado[0].name_pt == "garrafa"


def test_nome_desconhecido_cai_no_fallback_sem_traduzir():
    vision_data = {"objects": [{"name": "flux capacitor", "score": 0.9}]}

    resultado = _extract_objects(vision_data)

    assert resultado[0].name_pt == "flux capacitor"


def test_score_ausente_vira_zero():
    vision_data = {"objects": [{"name": "bottle"}]}

    resultado = _extract_objects(vision_data)

    assert resultado[0].score == 0.0


def test_ordena_do_maior_para_o_menor_score():
    vision_data = {
        "objects": [
            {"name": "cup", "score": 0.30},
            {"name": "bottle", "score": 0.95},
            {"name": "table", "score": 0.60},
        ]
    }

    resultado = _extract_objects(vision_data)

    # o primeiro da lista é o que a fala vai anunciar primeiro
    assert [o.name for o in resultado] == ["bottle", "table", "cup"]


def test_sem_a_chave_text_annotations_nao_quebra_e_cai_em_desconhecido():
    # Arrange — payload sem nenhuma das chaves esperadas.
    vision_data: dict = {}

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — o .get(..., []) evita KeyError e o fluxo chega ao último ramo.
    assert resultado.type == "unknown"
    assert resultado.confidence == 0.0


def test_sem_texto_mas_com_objetos_decide_por_objeto():
    # Arrange — sem "text_annotations", só objetos.
    vision_data = {
        "objects": [
            {
                "name": "bottle",
                "score": 0.9,
                "normalized_vertices": [{"x": 0.5, "y": 0.5}],
            }
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — como texts virou [], a decisão passa para o ramo de objetos.
    assert resultado.type == "object"


def test_text_annotations_vazio_equivale_a_chave_ausente():
    # Arrange
    sem_chave: dict = {}
    lista_vazia: dict = {"text_annotations": []}

    # Act / Assert — os dois caminhos precisam terminar igual.
    assert decide_text_or_object(sem_chave) == decide_text_or_object(lista_vazia)

def test_text_annotations_com_texto_decide_por_texto():
    # Arrange — payload com texto relevante.
    vision_data = {
        "text_annotations": [
            {"description": "Bilheteria"}
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — o ramo de OCR ganha e o valor da heurística é o combinado.
    assert resultado.type == "text"
    assert resultado.result == "Bilheteria"
    assert resultado.confidence == 0.9

def test_strip():
    # Arrange — a descrição vem com espaços e quebras de linha, como o Vision devolve.
    vision_data = {
        "text_annotations": [
            {"description": "\n  Saída de emergência  \n"}
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — o .strip() remove os espaços e quebras de linha.
    assert resultado.result == "Saída de emergência"


def test_somente_o_primeiro_item_conta():
    # Arrange — lista com três entradas, a primeira "Farmácia Popular" e as outras "Farmácia", "Popular".
    vision_data = {
        "text_annotations": [
            {"description": "Farmácia Popular"},
            {"description": "Farmácia"},
            {"description": "Popular"},
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — resultado.result == "Farmácia Popular". Isso trava o [0]: se alguém trocar por uma concatenação de todos os itens, o teste quebra.
    assert resultado.result == "Farmácia Popular"

def test_texto_em_branco_nao_e_texto():
    # Arrange — payload com chave text_annotations, mas sem conteúdo útil.
    vision_data = {
        "text_annotations": [
            {"description": "   \n"}
        ],
        "objects": [
            {"name": "bottle", "score": 0.9, "normalized_vertices": [{"x": 0.5, "y": 0.5}]}
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — o ramo de OCR é ignorado e a decisão passa para o ramo de objetos.
    assert resultado.type == "object"


def test_objetos_viajam_junto():
    # Arrange — payload com texto válido e objetos.
    vision_data = {
        "text_annotations": [
            {"description": "Farmácia Popular"}
        ],
        "objects": [
            {"name": "bottle", "score": 0.9, "normalized_vertices": [{"x": 0.5, "y": 0.5}]}
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — resultado.type == "text" e resultado.objects não vazio ([o.name for o in resultado.objects] == ["bottle"]).
    assert resultado.type == "text"
    assert [o.name for o in resultado.objects] == ["bottle"]


def test_escolhe_o_objeto_mais_confiavel():
    # Arrange — payload sem texto, mas com três labels.
    vision_data = {
        "labels": [
            {"description": "bottle", "score": 0.30},
            {"description": "cup", "score": 0.95},
            {"description": "table", "score": 0.60},
        ]
    }

    assert decide_text_or_object(vision_data).result == "copo"


def test_devolve_objeto_traduzido():
    # Arrange — payload sem texto, mas com um objeto.
    vision_data = {
        "objects": [
            {"name": "bottle", "score": 0.9, "normalized_vertices": [{"x": 0.5, "y": 0.5}]}
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — o nome do objeto é traduzido para pt-br.
    assert resultado.result.startswith("garrafa")

def test_label_sem_score_vale_zero():
    # Arrange — payload sem texto, mas com um label sem score.
    vision_data = {
        "labels": [
            {"description": "bottle"}
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — o score ausente vira 0.0.
    assert resultado.confidence == 0.0

def test_confidence_e_float():
    # Arrange — payload sem texto, mas com um label com score como string.
    vision_data = {
        "labels": [
            {"description": "bottle", "score": "0.9"}
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — o score é convertido para float.
    assert isinstance(resultado.confidence, float)
    assert resultado.confidence == 0.9

def test_sem_posicao_na_grade():
    # Arrange — payload sem texto, mas com um objeto sem vertices.
    vision_data = {
        "objects": [
            {"name": "bottle", "score": 0.9}
        ]
    }

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — o objeto sem vertices não tem posição na grade.
    assert resultado.objects[0].position == ""

def test_label_sem_description_vira_objeto():
    # Arrange — sem texto e sem objects, só um label sem a chave "description".
    # A chave precisa estar AUSENTE: com {"description": None} o .get() devolve
    # None (o default só vale para chave ausente) e o tradutor quebraria.
    vision_data = {"labels": [{"score": 0.9}]}

    # Act
    resultado = decide_text_or_object(vision_data)

    # Assert — o ramo de labels executa e usa o nome de fallback.
    assert resultado.type == "object"
    assert resultado.result == translate_object_name("Objeto")
    assert resultado.confidence == 0.9
