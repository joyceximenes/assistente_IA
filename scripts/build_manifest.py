"""Gera DATASET/manifest.csv a partir das anotações de desafio do VizWiz (quality issues).

Uma linha por imagem anotada (train e val), com um rótulo 0/1 por categoria.
test.json fica de fora: não traz votos (o rótulo do split de teste é oculto).
"""

import csv
import json
from pathlib import Path

DATASET = Path(__file__).resolve().parent.parent / "DATASET"
ANNOTATIONS = DATASET / "annotations_desafio"
OUTPUT = DATASET / "manifest.csv"

SPLITS = ["train", "val"]
CATEGORIES = ["BLR", "BRT", "DRK", "FRM"]

# Mínimo de anotadores (de 5) que precisam marcar a categoria para ela valer 1.
# >= 2 reproduz as taxas publicadas por Chiu, Zhao e Gurari (CVPR 2020).
THRESHOLD = 2


def build_rows():
    for split in SPLITS:
        items = json.loads((ANNOTATIONS / f"{split}.json").read_text(encoding="utf-8"))
        for item in items:
            image = item["image"]
            path = Path("images") / split / split / image
            if not (DATASET / path).is_file():
                raise FileNotFoundError(f"imagem anotada sem arquivo no disco: {path}")

            row = {"split": split, "caminho": path.as_posix()}
            for cat in CATEGORIES:
                row[cat] = int(item["flaws"].get(cat, 0) >= THRESHOLD)
            yield row


def main():
    rows = list(build_rows())
    with OUTPUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["split", "caminho", *CATEGORIES])
        writer.writeheader()
        writer.writerows(rows)

    print(f"{len(rows)} imagens -> {OUTPUT}")
    for split in SPLITS:
        subset = [r for r in rows if r["split"] == split]
        rates = ", ".join(
            f"{cat} {100 * sum(r[cat] for r in subset) / len(subset):.0f}%" for cat in CATEGORIES
        )
        print(f"  {split}: {len(subset)} imagens | {rates}")


if __name__ == "__main__":
    main()
