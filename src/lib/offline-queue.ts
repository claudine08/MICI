// Fila offline de criações de campo (E12 backlog §4 — §38; Fatia 1) e de
// fotos/edições de rascunho (Fatia 2).
//
// Toda mutação enfileirada usa o `clientUuid` já gerado no formulário: o
// reenvio é idempotente no servidor (devolve o registro original). A fila
// persiste em IndexedDB (fallback em memória) e sincroniza em FIFO:
//   - sucesso            → remove da fila;
//   - 4xx (erro de negócio) → status "failed" (não reenvia sozinho — o usuário
//     precisa corrigir os dados ou descartar);
//   - 5xx                → permanece "pending" com tentativa contada;
//   - falha de rede      → interrompe o flush (sem conexão).
// Escopo: POSTs de criação (diário/tarefa/restrição/medição), upload de foto
// (Blob no IndexedDB) e PATCH de edição editável na hora (regra de conflito:
// último-wins em rascunho; o servidor revalida a máquina de estados no replay
// — se o registro mudou de estado, o 4xx vira "failed" visível).

import { ApiError, apiRequest, apiUpload } from "@/lib/api-client";

export type OfflineEntity = "diary" | "task" | "constraint" | "progress" | "photo";

// POST = criação; PATCH = edição enfileirada (só rascunho editável). Itens
// antigos (Fatia 1) podem vir do IndexedDB sem o campo → tratados como POST.
export type OfflineMethod = "POST" | "PATCH";

export interface OfflineQueueItem {
  key: string;
  entity: OfflineEntity;
  method?: OfflineMethod;
  projectId: string;
  url: string;
  body: string;
  clientUuid?: string;
  createdAt: string;
  attempts: number;
  status: "pending" | "failed";
  lastError?: string;
  // Fatia 2 — foto offline: binário persistido como Blob (IndexedDB suporta).
  file?: Blob;
  fileName?: string;
  mimeType?: string;
}

export interface QueueStore {
  list(): Promise<OfflineQueueItem[]>;
  put(item: OfflineQueueItem): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface FlushResult {
  synced: number;
  failed: number;
  pending: number;
}

const QUEUE_EVENT = "mici:queue-changed";

function notify(synced = 0) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { synced } }));
}

// --- Stores ----------------------------------------------------------------

export class MemoryQueueStore implements QueueStore {
  private items = new Map<string, OfflineQueueItem>();

  async list() {
    return [...this.items.values()];
  }

  async put(item: OfflineQueueItem) {
    this.items.set(item.key, item);
  }

  async remove(key: string) {
    this.items.delete(key);
  }
}

const DB_NAME = "mici-offline";
const DB_STORE = "field-queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    if (request.error) reject(request.error);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbQueueStore implements QueueStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db() {
    if (!this.dbPromise) this.dbPromise = openDb();
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(DB_STORE, mode).objectStore(DB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async list() {
    return this.tx<OfflineQueueItem[]>("readonly", (store) => store.getAll());
  }

  async put(item: OfflineQueueItem) {
    await this.tx("readwrite", (store) => store.put(item) as IDBRequest<IDBValidKey>);
  }

  async remove(key: string) {
    await this.tx("readwrite", (store) => store.delete(key) as IDBRequest<undefined>);
  }
}

let sharedStore: QueueStore | null = null;

export function getQueueStore(): QueueStore {
  if (!sharedStore) {
    sharedStore = typeof indexedDB !== "undefined" ? new IndexedDbQueueStore() : new MemoryQueueStore();
  }
  return sharedStore;
}

// --- Fila ------------------------------------------------------------------

export interface EnqueueInput {
  entity: OfflineEntity;
  projectId: string;
  url: string;
  payload: Record<string, unknown>;
  method?: OfflineMethod;
}

export async function enqueueCreate(
  input: EnqueueInput,
  store: QueueStore = getQueueStore()
): Promise<OfflineQueueItem> {
  const clientUuid =
    typeof input.payload.clientUuid === "string" ? input.payload.clientUuid : undefined;
  const item: OfflineQueueItem = {
    key: crypto.randomUUID(),
    entity: input.entity,
    method: input.method ?? "POST",
    projectId: input.projectId,
    url: input.url,
    body: JSON.stringify(input.payload),
    clientUuid,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  };
  await store.put(item);
  notify();
  return item;
}

// --- Foto offline (Fatia 2) -----------------------------------------------

export interface EnqueuePhotoInput {
  projectId: string;
  url: string;
  meta: Record<string, unknown>;
  file: Blob;
  fileName: string;
  mimeType: string;
}

// Monta o multipart igual ao envio online: `file` + metadados não vazios.
function photoFormData(meta: Record<string, unknown>, file: Blob, fileName?: string): FormData {
  const form = new FormData();
  form.append("file", file, fileName ?? "foto");
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null || value === "") continue;
    form.append(key, String(value));
  }
  return form;
}

export function buildFormDataFor(item: OfflineQueueItem): FormData {
  if (!item.file) {
    throw new Error("Item da fila sem arquivo — upload de foto incompleto.");
  }
  const meta = JSON.parse(item.body || "{}") as Record<string, unknown>;
  return photoFormData(meta, item.file, item.fileName);
}

export async function enqueuePhoto(
  input: EnqueuePhotoInput,
  store: QueueStore = getQueueStore()
): Promise<OfflineQueueItem> {
  const clientUuid =
    typeof input.meta.clientUuid === "string" ? input.meta.clientUuid : undefined;
  const item: OfflineQueueItem = {
    key: crypto.randomUUID(),
    entity: "photo",
    method: "POST",
    projectId: input.projectId,
    url: input.url,
    body: JSON.stringify(input.meta),
    clientUuid,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
    file: input.file,
    fileName: input.fileName,
    mimeType: input.mimeType,
  };
  await store.put(item);
  notify();
  return item;
}

export async function getQueueCounts(
  store: QueueStore = getQueueStore()
): Promise<{ pending: number; failed: number }> {
  const items = await store.list();
  let pending = 0;
  let failed = 0;
  for (const item of items) {
    if (item.status === "pending") pending += 1;
    else failed += 1;
  }
  return { pending, failed };
}

export async function listQueueItems(store: QueueStore = getQueueStore()): Promise<OfflineQueueItem[]> {
  return store.list();
}

export async function discardFailedItems(store: QueueStore = getQueueStore()) {
  const items = await store.list();
  for (const item of items) {
    if (item.status === "failed") await store.remove(item.key);
  }
  notify();
}

type Sender = (item: OfflineQueueItem) => Promise<unknown>;

// Transporte injetável: em produção usa a API real (JSON via apiRequest,
// multipart via apiUpload/XHR); nos testes entra um mock puro.
export interface QueueTransport {
  json: (url: string, init: { method: string; body: string }) => Promise<unknown>;
  upload: (url: string, form: FormData) => Promise<unknown>;
}

const defaultTransport: QueueTransport = {
  json: (url, init) => apiRequest(url, init),
  upload: (url, form) => apiUpload(url, form),
};

// Despacho por tipo de item: foto → multipart (Blob); demais → JSON com o
// método gravado (POST ou PATCH). Itens legados sem method caem em POST.
export function sendQueuedItem(
  item: OfflineQueueItem,
  transport: QueueTransport = defaultTransport
): Promise<unknown> {
  if (item.entity === "photo") {
    return transport.upload(item.url, buildFormDataFor(item));
  }
  return transport.json(item.url, { method: item.method ?? "POST", body: item.body });
}

const defaultSender: Sender = (item) => sendQueuedItem(item);

export async function flushQueueWith(
  store: QueueStore,
  send: Sender = defaultSender
): Promise<FlushResult> {
  const items = (await store.list())
    .filter((item) => item.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await send(item);
      await store.remove(item.key);
      synced += 1;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 0) {
        break; // sem conexão — reenvia no próximo flush
      }
      if (caught instanceof ApiError && caught.status >= 400 && caught.status < 500) {
        await store.put({ ...item, status: "failed", attempts: item.attempts + 1, lastError: caught.message });
        failed += 1;
        continue;
      }
      await store.put({ ...item, attempts: item.attempts + 1, lastError: caught instanceof Error ? caught.message : String(caught) });
    }
  }

  if (synced > 0 || failed > 0) notify(synced);
  const counts = await getQueueCounts(store);
  return { synced, failed, pending: counts.pending };
}

// Flush global com trava de concorrência (o evento "online" e o botão manual
// podem disparar ao mesmo tempo — o reenvio duplo seria absorvido pelo
// clientUuid, mas evitamos a corrida mesmo assim).
let flushInFlight: Promise<FlushResult> | null = null;

export function flushQueue(): Promise<FlushResult> {
  if (!flushInFlight) {
    flushInFlight = flushQueueWith(getQueueStore()).finally(() => {
      flushInFlight = null;
    });
  }
  return flushInFlight;
}

// --- Criação/edição com fallback para a fila --------------------------------

// Devolve "queued" quando a mutação foi para a fila (offline ou queda de
// rede); erros de negócio (4xx) são relançados para a UI tratar como hoje.
async function sendOrQueueWith(
  input: EnqueueInput,
  send: (url: string, body: string) => Promise<unknown>
): Promise<"sent" | "queued"> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!offline) {
    try {
      await send(input.url, JSON.stringify(input.payload));
      return "sent";
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 0) throw caught;
    }
  }
  await enqueueCreate(input);
  return "queued";
}

export function sendOrQueueCreate(
  input: EnqueueInput,
  send: (url: string, body: string) => Promise<unknown> = (url, body) =>
    apiRequest(url, { method: "POST", body })
): Promise<"sent" | "queued"> {
  return sendOrQueueWith({ ...input, method: "POST" }, send);
}

// Edição enfileirada (regra de conflito): último-wins no rascunho; o replay
// revalida a máquina de estados no servidor (4xx → "failed" visível).
export function sendOrQueueEdit(
  input: EnqueueInput,
  send: (url: string, body: string) => Promise<unknown> = (url, body) =>
    apiRequest(url, { method: "PATCH", body })
): Promise<"sent" | "queued"> {
  return sendOrQueueWith({ ...input, method: "PATCH" }, send);
}

// Upload de foto com fallback: online manda multipart (XHR com progresso e
// diagnóstico); offline/queda de rede persiste o Blob na fila.
export async function sendOrQueuePhoto(
  input: EnqueuePhotoInput,
  send: (url: string, form: FormData) => Promise<unknown> = (url, form) => apiUpload(url, form)
): Promise<"sent" | "queued"> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!offline) {
    try {
      await send(input.url, photoFormData(input.meta, input.file, input.fileName));
      return "sent";
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 0) throw caught;
    }
  }
  await enqueuePhoto(input);
  return "queued";
}
