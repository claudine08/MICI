export const AI_PROMPTS: { code: string; name: string; description: string; template: string; model: string }[] = [
  {
    code: "DAILY_SUMMARY",
    name: "Resumo diário de obra",
    description: "Gera um resumo executivo do diário de obra do dia.",
    template: "Resuma o seguinte diário de obra em 5 bullet points, destacando avanço, restrições e riscos:\n\n{{input}}",
    model: "glm-5.3-flash-free",
  },
  {
    code: "RISK_CLASSIFY",
    name: "Classificação de risco",
    description: "Classifica probabilidade e impacto de um risco.",
    template: "Classifique o risco a seguir em probabilidade (1-5) e impacto (1-5) e sugira uma resposta:\n\n{{input}}",
    model: "glm-5.3-flash-free",
  },
  {
    code: "DOC_EXTRACT",
    name: "Extração de documento",
    description: "Extrai campos-chave de um documento.",
    template: "Extraia os campos (título, data, valor, responsável) do documento a seguir:\n\n{{input}}",
    model: "glm-5.3-flash-free",
  },
  {
    code: "SEMANTIC_SEARCH",
    name: "Busca semântica",
    description: "Busca registros relevantes por significado.",
    template: "Encontre os registros mais relevantes para a consulta: {{input}}",
    model: "glm-5.3-flash-free",
  },
];