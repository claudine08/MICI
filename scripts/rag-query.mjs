#!/usr/bin/env node
// Retrieval do RAG leve: dado um termo, retorna apenas os chunks relevantes
// (com o conteudo real do arquivo nas linhas indicadas), em vez de ler o
// arquivo inteiro. Reduz consumo de tokens.
//
// Uso:
//   node scripts/rag-query.mjs <termo> [<termo2> ...]   -> busca em titulo/resumo/fonte
//   node scripts/rag-query.mjs --file DIARIO.md         -> todos os chunks de um arquivo
//   node scripts/rag-query.mjs --id devcurrent-estado   -> chunk por id exato
//   npm run rag:query -- <termo>

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_JSON = path.join(ROOT, "docs", "rag-index.json");

function loadIndex() {
  if (!fs.existsSync(INDEX_JSON)) {
    console.error("Indice nao encontrado. Rode `npm run rag:index` primeiro.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(INDEX_JSON, "utf8"));
}

function readChunk(c) {
  const abs = path.join(ROOT, c.file);
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const body = lines.slice(c.startLine - 1, c.endLine).join("\n");
  return body;
}

function main() {
  const args = process.argv.slice(2);
  const index = loadIndex();
  const chunks = index.chunks;

  let selected = [];
  if (args.includes("--file")) {
    const i = args.indexOf("--file");
    const f = args[i + 1];
    selected = chunks.filter((c) => c.file === f);
  } else if (args.includes("--id")) {
    const i = args.indexOf("--id");
    const id = args[i + 1];
    selected = chunks.filter((c) => c.id === id);
  } else {
    const terms = args.map((t) => t.toLowerCase());
    if (terms.length === 0) {
      console.error("Uso: rag-query.mjs <termo> ... | --file <arquivo> | --id <id>");
      process.exit(1);
    }
    selected = chunks.filter((c) => {
      const hay = `${c.id} ${c.title} ${c.summary} ${c.file} ${c.tags.join(" ")}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    });
  }

  if (selected.length === 0) {
    console.log("Nenhum chunk encontrado.");
    return;
  }

  console.log(`# ${selected.length} chunk(s) recuperado(s)\n`);
  for (const c of selected) {
    console.log(`## ${c.id} — ${c.title}`);
    console.log(`> ${c.file}:${c.startLine}-${c.endLine}\n`);
    console.log(readChunk(c));
    console.log("\n---\n");
  }
}

main();
