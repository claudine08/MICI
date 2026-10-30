import type { MetadataRoute } from "next";

// Manifest PWA (E12 backlog §4 — Fatia 1). Rota de metadata do App Router:
// gera /manifest.webmanifest e o link automático no <head>.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MICI — Gestão de Implantação",
    short_name: "MICI",
    description:
      "MICI: plataforma SaaS de gestão de implantação com baseline imutável, port gates e governança multiempresa.",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f9",
    theme_color: "#2563eb",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
