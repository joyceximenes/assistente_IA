// Roda o guidance.ts real (o mesmo que o app usa) contra cada imagem do
// manifesto do VizWiz, num Chromium headless servido pelo Vite, e grava as
// pontuações num CSV que o projeto `analysis/` (Python) consome depois.
//
// Por que um navegador: analyzeFrameForGuidance() recebe ImageData, que só
// existe depois de um canvas.drawImage() redimensionar a imagem — e esse
// redimensionamento precisa ser feito pelo navegador (mesmo algoritmo do
// app), não por outra biblioteca, senão os números não correspondem ao que
// o app calcularia de verdade. Ver "6. Anotações para o artigo.md", seção 5.

import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const FRONTEND_ROOT = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "DATASET", "manifest.csv");
const IMAGES_ROOT = path.join(REPO_ROOT, "DATASET");
const OUTPUT_PATH = path.join(REPO_ROOT, "analysis", "data", "guidance_scores.csv");
const PROGRESS_EVERY = 500;
const EVALUATE_TIMEOUT_MS = 15_000;
// Recicla a página a cada N imagens: processar 31 mil imagens numa única
// página, sem nunca navegar de novo, deixa canvas/ImageData se acumulando
// até a página parar de responder (visto na prática: processo ficou preso,
// sem erro, sem uso de CPU, depois de ~10 mil imagens na mesma página).
const PAGE_RECYCLE_EVERY = 2000;

// --limit=N processa só as N primeiras linhas (depuração rápida antes da
// rodada completa, que leva bem mais tempo nas 31 mil imagens).
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

const OUTPUT_HEADER =
  "split,caminho,BLR,BRT,DRK,FRM,ok,message,blurScore,edgeScore,brightnessScore,overexposedRatio\n";

async function* readManifestRows() {
  const rl = createInterface({ input: createReadStream(MANIFEST_PATH, "utf-8") });
  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    if (!line.trim()) continue;
    const [split, caminho, blr, brt, drk, frm] = line.split(",");
    yield { split, caminho, blr, brt, drk, frm };
  }
}

// Conta quantas linhas de dados já existem num CSV de saída de uma rodada
// anterior, interrompida — permite retomar em vez de reprocessar do zero.
async function countExistingRows(filePath) {
  if (!existsSync(filePath)) return 0;
  const rl = createInterface({ input: createReadStream(filePath, "utf-8") });
  let lines = 0;
  for await (const line of rl) {
    if (line.trim()) lines++;
  }
  return Math.max(0, lines - 1); // -1 pelo cabeçalho
}

async function openHarnessPage(browser, port) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/scripts/guidance-harness.html`);
  await page.waitForFunction("typeof window.scoreImage === 'function'");
  return page;
}

async function scoreWithTimeout(page, dataUrl) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate((url) => window.scoreImage(url), dataUrl),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout no page.evaluate")), EVALUATE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const server = await createServer({ root: FRONTEND_ROOT, server: { port: 0 } });
  await server.listen();
  const port = server.config.server.port;

  const browser = await chromium.launch();
  let page = await openHarnessPage(browser, port);

  const alreadyDone = await countExistingRows(OUTPUT_PATH);
  const out = createWriteStream(OUTPUT_PATH, { encoding: "utf-8", flags: alreadyDone > 0 ? "a" : "w" });
  if (alreadyDone === 0) out.write(OUTPUT_HEADER);
  else console.log(`Retomando: ${alreadyDone} imagens já processadas numa rodada anterior.`);

  let count = 0;
  let failed = 0;
  const startedAt = Date.now();

  for await (const row of readManifestRows()) {
    if (count < alreadyDone) {
      count++;
      continue;
    }
    if (count >= LIMIT) break;
    count++;
    try {
      const imagePath = path.join(IMAGES_ROOT, row.caminho);
      const bytes = await readFile(imagePath);
      const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;

      const g = await scoreWithTimeout(page, dataUrl);

      out.write(
        [
          row.split,
          row.caminho,
          row.blr,
          row.brt,
          row.drk,
          row.frm,
          g.ok,
          g.message,
          g.blurScore,
          g.edgeScore,
          g.brightnessScore,
          g.overexposedRatio,
        ].join(",") + "\n",
      );
    } catch (err) {
      failed++;
      console.warn(`[${count}] falhou em ${row.caminho}: ${err.message}`);
      // Página pode ter travado de verdade (não só uma imagem ruim) —
      // recicla já, em vez de esperar o próximo ponto agendado.
      if (err.message.includes("timeout")) {
        await page.close().catch(() => {});
        page = await openHarnessPage(browser, port);
      }
    }

    if (count % PAGE_RECYCLE_EVERY === 0) {
      await page.close();
      page = await openHarnessPage(browser, port);
    }

    if (count % PROGRESS_EVERY === 0) {
      const elapsedS = (Date.now() - startedAt) / 1000;
      console.log(`${count} imagens processadas (${failed} falhas) — ${elapsedS.toFixed(0)}s`);
    }
  }

  out.end();
  await browser.close();
  await server.close();

  console.log(`Concluído: ${count} imagens, ${failed} falhas. Saída: ${OUTPUT_PATH}`);
}

main();
