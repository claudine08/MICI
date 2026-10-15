// engine.ts — EVM (Earned Value Management, E08 §29) puro, sem I/O.
// Recebe os dados consolidados do custo + progresso e devolve os indicadores
// de desempenho. Convenções:
//   BAC = orçamento total (soma dos itens de custo vivos).
//   PV  = valor planejado até a data de corte. Derivado dos itens vinculados a
//         WBS: o peso de cada item é a sua parcela do BAC e o progresso
//         planejado vem do cronograma (fração da duração já decorrida até a
//         data de corte entre as atividades do seu nó WBS). Sem vínculo WBS o
//         item conta como 0% planejado (não há base temporal).
//   EV  = Σ (amount × progresso físico do item). O progresso físico do item é
//         a média simples do physicalProgress das atividades do seu nó WBS
//         (0 quando não vinculado — mensuração manual pendente).
//   AC  = soma dos custos realizados (actuals).
// Débitos/índices conforme PMI: CV=EV−AC, SV=EV−PV, CPI=EV/AC, SPI=EV/PV.

export interface EvmActivityInput {
  wbsNodeId: string | null;
  duration: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
  physicalProgress: number;
  plannedStart: string | null;
  plannedFinish: string | null;
}

export interface EvmItemInput {
  code: string;
  amount: number;
  wbsNodeId: string | null;
}

export interface EvmActualInput {
  amount: number;
}

export interface EvmInput {
  items: EvmItemInput[];
  actuals: EvmActualInput[];
  activities: EvmActivityInput[];
  dataDate: string; // AAAA-MM-DD
  projectStartDate?: string | null;
}

export interface EvmResult {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  cv: number | null; // EV − AC (null sem AC)
  sv: number | null; // EV − PV (null sem PV)
  cpi: number | null; // EV / AC (null sem AC)
  spi: number | null; // EV / PV (null sem PV)
  eac: number | null; // BAC / CPI (com CPI) ou AC + (BAC − EV)
  vac: number | null; // BAC − EAC
  percentPlanned: number; // PV / BAC (%)
  percentEarned: number; // EV / BAC (%)
  percentSpent: number; // AC / BAC (%)
  dataDate: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dayMs(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

// Fração da duração planejada decorrida até a data de corte (0..1).
// Atividade sem datas planejadas contribui 0; concluída antes da data
// contribui 1; iniciada depois da data contribui 0.
export function plannedProgressRatio(
  plannedStart: string | null,
  plannedFinish: string | null,
  dataDate: string
): number {
  if (!plannedStart || !plannedFinish) return 0;
  const start = dayMs(plannedStart);
  const finish = dayMs(plannedFinish);
  const cutoff = dayMs(dataDate);
  if (!(finish >= start)) return 0;
  if (cutoff <= start) return 0;
  if (cutoff >= finish) return 1;
  const total = finish - start;
  if (total === 0) return cutoff >= finish ? 1 : 0;
  return (cutoff - start) / total;
}

// Progresso físico médio das atividades de um nó WBS (0..100).
function progressOfNode(
  activities: EvmActivityInput[],
  wbsNodeId: string
): number {
  const linked = activities.filter((activity) => activity.wbsNodeId === wbsNodeId);
  if (linked.length === 0) return 0;
  const total = linked.reduce((acc, activity) => acc + activity.physicalProgress, 0);
  return total / linked.length;
}

// Progresso planejado médio das atividades de um nó WBS (0..1).
function plannedOfNode(
  activities: EvmActivityInput[],
  wbsNodeId: string,
  dataDate: string
): number {
  const linked = activities.filter((activity) => activity.wbsNodeId === wbsNodeId);
  if (linked.length === 0) return 0;
  const total = linked.reduce(
    (acc, activity) =>
      acc + plannedProgressRatio(activity.plannedStart, activity.plannedFinish, dataDate),
    0
  );
  return total / linked.length;
}

export function computeEvm(input: EvmInput): EvmResult {
  const bac = input.items.reduce((acc, item) => acc + item.amount, 0);
  const ac = input.actuals.reduce((acc, actual) => acc + actual.amount, 0);

  // EV: Σ amount × progresso físico (0..1) do item.
  let ev = 0;
  // PV: Σ amount × progresso planejado (0..1) do item.
  let pv = 0;
  for (const item of input.items) {
    if (!item.wbsNodeId || item.amount <= 0) continue;
    const physical = progressOfNode(input.activities, item.wbsNodeId) / 100;
    ev += item.amount * physical;
    pv += item.amount * plannedOfNode(input.activities, item.wbsNodeId, input.dataDate);
  }

  const cv = ac > 0 ? ev - ac : null;
  const sv = pv > 0 ? ev - pv : null;
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv > 0 ? ev / pv : null;
  // EAC: com CPI confiável usa BAC/CPI; sem AC ainda, EAC = BAC (sem desvio).
  const eac = cpi && cpi > 0 ? bac / cpi : ac > 0 ? ac + (bac - ev) : bac;
  const vac = bac - eac;

  return {
    bac: round2(bac),
    pv: round2(pv),
    ev: round2(ev),
    ac: round2(ac),
    cv: cv === null ? null : round2(cv),
    sv: sv === null ? null : round2(sv),
    cpi: cpi === null ? null : round2(cpi),
    spi: spi === null ? null : round2(spi),
    eac: round2(eac),
    vac: round2(vac),
    percentPlanned: bac > 0 ? round2((pv / bac) * 100) : 0,
    percentEarned: bac > 0 ? round2((ev / bac) * 100) : 0,
    percentSpent: bac > 0 ? round2((ac / bac) * 100) : 0,
    dataDate: input.dataDate,
  };
}
