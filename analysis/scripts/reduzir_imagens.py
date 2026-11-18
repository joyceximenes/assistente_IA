"""Reduz as fotos de treino e validação do VizWiz para 224 x 224 (s5c, passo 1).

Cada foto inteira é esticada até o quadrado, sem cortar, depois de aplicar a orientação EXIF.
Lê DATASET/manifest.csv e grava em PNG (sem perda) em DATASET/images/224/<split>/, mais um
manifest_224.csv com os rótulos das fotos gravadas. Pode ser interrompido e rodado de novo: pula o
que já existe.

Exemplos (a partir de analysis/):
    uv run python scripts/reduzir_imagens.py --por-split 10 --saida ../DATASET/images/224_teste/png
    uv run python scripts/reduzir_imagens.py
"""

import argparse
import sys
import time
from pathlib import Path

import pandas as pd
from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parents[2]
DATASET = RAIZ / "DATASET"
ROTULOS = ["BLR", "BRT", "DRK", "FRM"]
EXTENSAO = {"jpeg": ".jpg", "png": ".png"}
TAG_ORIENTACAO = 0x0112  # tag EXIF "Orientation"; 1 = foto já está em pé


def ler_argumentos():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--formato", choices=EXTENSAO, default="png")  # png: sem perda (decisão do s5c)
    p.add_argument("--qualidade", type=int, default=95, help="só vale para jpeg")
    p.add_argument("--tamanho", type=int, default=224)
    p.add_argument(
        "--por-split", type=int, default=None, help="teste: N fotos sorteadas de cada split"
    )
    p.add_argument("--saida", type=Path, default=DATASET / "images" / "224")
    return p.parse_args()


def carregar_manifesto(por_split):
    """Devolve (fotos a processar, quantas fotos há no total de treino e validação)."""
    manifesto = pd.read_csv(DATASET / "manifest.csv")
    manifesto = manifesto[manifesto["split"].isin(["train", "val"])]
    total = len(manifesto)
    if por_split is not None:
        manifesto = manifesto.groupby("split").sample(n=por_split, random_state=0)
    return manifesto.reset_index(drop=True), total


def reduzir(origem, destino, tamanho, formato, qualidade):
    """Reduz uma foto e grava em destino. Devolve True se a foto estava girada no EXIF."""
    with Image.open(origem) as img:
        girada = img.getexif().get(TAG_ORIENTACAO, 1) != 1
        img = ImageOps.exif_transpose(img).convert("RGB")
        img = img.resize((tamanho, tamanho), Image.Resampling.BILINEAR)
    destino.parent.mkdir(parents=True, exist_ok=True)
    # grava num arquivo temporário e renomeia, para uma interrupção não deixar um arquivo pela metade
    temporario = destino.with_name(destino.name + ".tmp")
    if formato == "jpeg":
        img.save(temporario, "JPEG", quality=qualidade)
    else:
        img.save(temporario, "PNG")
    temporario.replace(destino)
    return girada


def main():
    args = ler_argumentos()
    extensao = EXTENSAO[args.formato]
    fotos, total_completo = carregar_manifesto(args.por_split)
    passo = max(1, len(fotos) // 20)

    gravadas, puladas, giradas = 0, 0, 0
    tamanhos, linhas, erros = [], [], []
    inicio = time.time()

    for i, foto in enumerate(fotos.itertuples(index=False), start=1):
        relativo = Path(foto.split) / (Path(foto.caminho).stem + extensao)
        destino = args.saida / relativo
        try:
            if destino.exists() and destino.stat().st_size > 0:
                puladas += 1
            else:
                giradas += reduzir(
                    DATASET / foto.caminho, destino, args.tamanho, args.formato, args.qualidade
                )
                gravadas += 1
            tamanhos.append(destino.stat().st_size)
            linhas.append(
                {
                    "split": foto.split,
                    "arquivo": relativo.as_posix(),
                    **{r: getattr(foto, r) for r in ROTULOS},
                }
            )
        except (
            OSError,
            ValueError,
            Image.DecompressionBombError,
        ) as erro:  # foto ruim não derruba as outras
            erros.append((foto.caminho, repr(erro)))
        if i % passo == 0 or i == len(fotos):
            print(f"{i}/{len(fotos)} fotos | {time.time() - inicio:.0f} s", flush=True)

    args.saida.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(linhas).to_csv(args.saida / "manifest_224.csv", index=False)

    decorrido = time.time() - inicio
    media_kb = sum(tamanhos) / len(tamanhos) / 1024 if tamanhos else 0
    print("\n--- resumo ---")
    print(
        f"formato: {args.formato} | tamanho: {args.tamanho} x {args.tamanho} | saída: {args.saida}"
    )
    print(f"gravadas agora: {gravadas} | já existiam: {puladas} | com erro: {len(erros)}")
    print(f"giradas no EXIF (entre as gravadas agora): {giradas}")
    print(f"tamanho em disco: {sum(tamanhos) / 1024**2:.1f} MB | média por foto: {media_kb:.1f} KB")
    print(f"tempo: {decorrido:.1f} s ({decorrido / max(1, gravadas):.3f} s por foto gravada)")
    print(
        f"projeção para as {total_completo} fotos (a partir da média): {media_kb * total_completo / 1024**2:.2f} GB"
    )
    for caminho, erro in erros[:10]:
        print(f"ERRO {caminho}: {erro}")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
