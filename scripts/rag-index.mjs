#!/usr/bin/env node
// RAG leve para documentacao de desenvolvimento do MICI.
// Gera um indice de chunks (por secao de markdown) a partir dos arquivos
// grandes (DIARIO, ROADMAP, suprimentos, qualidade, campo, custos, ...).
// Objetivo: permitir recuperar so o trecho relevante, reduzindo tokens.
//
// Uso:
//   node scripts/rag-index.mjs            -> gera docs/rag-index.json + docs/rag-index.md
//   npm run rag:index

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "docs");
const INDEX_JSON = path.join(OUT_DIR, "rag-index.json");
const INDEX_MD = path.join(OUT_DIR, "rag-index.md");

// Arquivos fonte (relativos a ROOT). Apenas os que existirem sao indexados.
const SOURCES = [
  { file: "devcurrent.md", label: "devcurrent" },
  { file: "DIARIO.md", label: "diario" },
  { file: "ROADMAP.md", label: "roadmap" },
  { file: "suprimentos.md", label: "suprimentos" },
  { file: "qualidade.md", label: "qualidade" },
  { file: "campo.md", label: "campo" },
  { file: "custos.md", label: "custos" },
  { file: "metodologia.md", label: "metodologia" },
];

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function summarize(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;
  return clean.slice(0, 157).trimEnd() + "...";
}

function chunkFile(relFile, label) {
  const abs = path.join(ROOT, relFile);
  if (!fs.existsSync(abs)) return [];
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const chunks = [];
  // Encontra headings ## e ### (nivel 2/3). Cada chunk = de um heading ao proximo heading de nivel <=.
  const headings = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (m) headings.push({ idx: i, level: m[1].length, title: m[2].trim() });
  });

  // Se nao houver headings, trata o arquivo inteiro como um chunk.
  if (headings.length === 0) {
    const body = lines.join("\n").trim();
    if (!body) return [];
    chunks.push({
      id: `${label}-root`,
      title: relFile,
      level: 1,
      file: relFile,
      startLine: 1,
      endLine: lines.length,
      summary: summarize(body),
      tags: [label],
    });
    return chunks;
  }

  headings.forEach((h, i) => {
    const next = headings[i + 1];
    const endIdx = next ? next.idx - 1 : lines.length - 1;
    const bodyLines = lines.slice(h.idx + 1, endIdx + 1);
    const body = bodyLines.join("\n").trim();
    if (!body && i + 1 < headings.length) {
      // heading vazio (so titulo) — ainda assim registra, mas sem resumo
    }
    const id = `${label}-${slugify(h.title) || "sec" + i}`;
    // Garante unicidade adicionando sufixo se necessario (tratado depois).
    chunks.push({
      id,
      title: h.title,
      level: h.level,
      file: relFile,
      startLine: h.idx + 1,
      endLine: endIdx + 1,
      summary: body ? summarize(body) : "(secao sem corpo)",
      tags: [label],
    });
  });
  return chunks;
}

function dedupeIds(chunks) {
  const seen = new Map();
  for (const c of chunks) {
    if (seen.has(c.id)) {
      const n = seen.get(c.id) + 1;
      seen.set(c.id, n);
      c.id = `${c.id}-${n}`;
    } else {
      seen.set(c.id, 1);
    }
  }
  return chunks;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  let all = [];
  const sourcesUsed = [];
  for (const src of SOURCES) {
    const abs = path.join(ROOT, src.file);
    if (!fs.existsSync(abs)) continue;
    sourcesUsed.push(src.file);
    all = all.concat(chunkFile(src.file, src.label));
  }
  all = dedupeIds(all);

  const index = {
    generatedAt: new Date().toISOString(),
    sources: sourcesUsed,
    chunkCount: all.length,
    chunks: all,
  };

  fs.writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2) + "\n", "utf8");

  // Markdown compacto (tabela). Resumo truncado para caber.
  const mdLines = [];
  mdLines.push("# RAG Index — chunks de documentacao de desenvolvimento");
  mdLines.push("");
  mdLines.push("> Gerado por `npm run rag:index` (scripts/rag-index.mjs).");
  mdLines.push("> Use `npm run rag:query <termo>` para recuperar so os chunks relevantes.");
  mdLines.push(`> Fontes: ${sourcesUsed.join(", ")}. Total de chunks: ${all.length}.`);
  mdLines.push("");
  mdLines.push("| ID | Titulo | Fonte:linhas | Resumo |");
  mdLines.push("|---|---|---|---|");
  for (const c of all) {
    const ref = `${c.file}:${c.startLine}-${c.endLine}`;
    const title = c.title.replace(/\|/g, "\\|");
    const summary = c.summary.replace(/\|/g, "\\|");
    mdLines.push(`| \`${c.id}\` | ${title} | ${ref} | ${summary} |`);
  }
  mdLines.push("");
  fs.writeFileSync(INDEX_MD, mdLines.join("\n"), "utf8");

  console.log(`RAG index gerado: ${all.length} chunks em ${sourcesUsed.length} arquivos.`);
  console.log(`  JSON: ${path.relative(ROOT, INDEX_JSON)}`);
  console.log(`  MD:   ${path.relative(ROOT, INDEX_MD)}`);
}

main();
