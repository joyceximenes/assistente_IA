from dataclasses import dataclass, field
from typing import Any, Dict, List


# O Google Vision retorna nomes de objetos em inglês.
# Dicionário de tradução para os objetos mais comuns no contexto do app
# (rótulos, embalagens, ambientes domésticos). Fallback: nome original.
OBJECT_NAMES_PT: Dict[str, str] = {
    "person": "pessoa",
    "bottle": "garrafa",
    "bottled and jarred packaged goods": "produto embalado",
    "packaged goods": "produto embalado",
    "tin can": "lata",
    "can": "lata",
    "box": "caixa",
    "carton": "caixa de papelão",
    "food": "alimento",
    "drink": "bebida",
    "snack": "lanche",
    "fruit": "fruta",
    "apple": "maçã",
    "banana": "banana",
    "orange": "laranja",
    "vegetable": "legume",
    "bread": "pão",
    "cup": "copo",
    "mug": "caneca",
    "coffee cup": "xícara de café",
    "bowl": "tigela",
    "plate": "prato",
    "spoon": "colher",
    "fork": "garfo",
    "knife": "faca",
    "kitchen utensil": "utensílio de cozinha",
    "tableware": "louça",
    "book": "livro",
    "paper": "papel",
    "notebook": "caderno",
    "pen": "caneta",
    "pencil": "lápis",
    "scissors": "tesoura",
    "mobile phone": "celular",
    "telephone": "telefone",
    "laptop": "notebook",
    "computer keyboard": "teclado",
    "computer mouse": "mouse",
    "computer monitor": "monitor",
    "television": "televisão",
    "remote control": "controle remoto",
    "headphones": "fone de ouvido",
    "speaker": "caixa de som",
    "clock": "relógio",
    "watch": "relógio de pulso",
    "glasses": "óculos",
    "sunglasses": "óculos de sol",
    "clothing": "roupa",
    "shirt": "camisa",
    "pants": "calça",
    "dress": "vestido",
    "shoe": "sapato",
    "hat": "chapéu",
    "bag": "bolsa",
    "handbag": "bolsa de mão",
    "backpack": "mochila",
    "luggage & bags": "bolsa ou mala",
    "wallet": "carteira",
    "money": "dinheiro",
    "coin": "moeda",
    "key": "chave",
    "door": "porta",
    "window": "janela",
    "table": "mesa",
    "desk": "escrivaninha",
    "chair": "cadeira",
    "couch": "sofá",
    "bed": "cama",
    "pillow": "travesseiro",
    "towel": "toalha",
    "toothbrush": "escova de dentes",
    "medicine": "remédio",
    "pill bottle": "frasco de remédio",
    "houseplant": "planta",
    "plant": "planta",
    "flower": "flor",
    "animal": "animal",
    "dog": "cachorro",
    "cat": "gato",
    "bird": "pássaro",
    "car": "carro",
    "bicycle": "bicicleta",
    "motorcycle": "moto",
    "bus": "ônibus",
    "toy": "brinquedo",
    "light bulb": "lâmpada",
    "lamp": "luminária",
    "cabinetry": "armário",
    "shelf": "prateleira",
    "refrigerator": "geladeira",
    "microwave oven": "micro-ondas",
    "oven": "forno",
    "sink": "pia",
    "umbrella": "guarda-chuva",
}


@dataclass
class DetectedObjectInfo:
    name: str          # nome original (inglês, como veio do Vision)
    name_pt: str       # nome traduzido para fala
    score: float
    position: str      # posição na grade 3x3 ("no centro", "à esquerda", ...)


@dataclass
class Decision:
    type: str          # "text" | "object" | "unknown"
    result: str
    confidence: float
    objects: List[DetectedObjectInfo] = field(default_factory=list)


def translate_object_name(name: str) -> str:
    return OBJECT_NAMES_PT.get(name.strip().lower(), name)


def grid_position_label(cx: float, cy: float) -> str:
    """
    Mapeia o centro normalizado (0..1) de um objeto para a célula de uma
    grade 3x3, descrita em linguagem natural para feedback por áudio.
    """
    col = 0 if cx < 1 / 3 else (1 if cx < 2 / 3 else 2)
    row = 0 if cy < 1 / 3 else (1 if cy < 2 / 3 else 2)

    col_label = ["à esquerda", "", "à direita"][col]
    row_label = ["na parte de cima", "", "na parte de baixo"][row]

    if col == 1 and row == 1:
        return "no centro"
    if col == 1:
        return row_label
    if row == 1:
        return col_label
    return f"{col_label}, {row_label}"


def _extract_objects(vision_data: Dict[str, Any]) -> List[DetectedObjectInfo]:
    detected: List[DetectedObjectInfo] = []
    for obj in vision_data.get("objects", []) or []:
        name = (obj.get("name") or "").strip()
        if not name:
            continue
        vertices = obj.get("normalized_vertices") or []
        xs = [v.get("x", 0.0) for v in vertices]
        ys = [v.get("y", 0.0) for v in vertices]
        position = ""
        if xs and ys:
            position = grid_position_label(sum(xs) / len(xs), sum(ys) / len(ys))
        detected.append(
            DetectedObjectInfo(
                name=name,
                name_pt=translate_object_name(name),
                score=float(obj.get("score", 0.0) or 0.0),
                position=position,
            )
        )
    detected.sort(key=lambda d: d.score, reverse=True)
    return detected


def decide_text_or_object(vision_data: Dict[str, Any]) -> Decision:
    """
    Aplica regra de decisão:
    - Se houver OCR relevante → texto (objetos vão junto, como contexto)
    - Senão, se houver objetos localizados → objeto com posição na grade 3x3
    - Senão, se houver labels → objeto sem posição
    - Senão → desconhecido
    """
    texts = vision_data.get("text_annotations", [])
    labels = vision_data.get("labels", [])
    objects = _extract_objects(vision_data)

    # OCR: o primeiro item costuma ser o texto completo
    if texts and (texts[0].get("description") or "").strip():
        text = texts[0]["description"].strip()
        return Decision(
            type="text",
            result=text,
            confidence=0.9,  # heurística simples para TCC
            objects=objects,
        )

    # Objetos localizados (com posição na grade)
    if objects:
        parts = [f"{o.name_pt} {o.position}".strip() for o in objects[:3]]
        return Decision(
            type="object",
            result="; ".join(parts),
            confidence=objects[0].score,
            objects=objects,
        )

    # Labels gerais (sem posição)
    if labels:
        best = max(labels, key=lambda l: l.get("score", 0))
        return Decision(
            type="object",
            result=translate_object_name(best.get("description", "Objeto")),
            confidence=float(best.get("score", 0)),
        )

    # Nada encontrado
    return Decision(
        type="unknown",
        result="Não foi possível identificar texto ou objeto.",
        confidence=0.0,
    )
