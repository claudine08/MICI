// Testes da fila offline de criações de campo (E12 backlog §4 — Fatia 1).

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
  buildFormDataFor,
  discardFailedItems,
  enqueueCreate,
  enqueuePhoto,
  flushQueueWith,
  getQueueCounts,
  listQueueItems,
  MemoryQueueStore,
  sendOrQueueCreate,
  sendOrQueueEdit,
  sendOrQueuePhoto,
  sendQueuedItem,
} from "@/lib/offline-queue";

function pendingItem(overrides: Record<string, unknown> = {}) {
  return {
    key: "k1",
    entity: "diary" as const,
    projectId: "p1",
    url: "/api/v1/projetos/p1/campo/diarios",
    body: JSON.stringify({ title: "x", clientUuid: "uuid-1" }),
    clientUuid: "uuid-1",
    createdAt: "2026-10-29T10:00:00.000Z",
    attempts: 0,
    status: "pending" as const,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MemoryQueueStore", () => {
  it("put/list/remove persiste por chave", async () => {
    const store = new MemoryQueueStore();
    await store.put(pendingItem());
    await store.put(pendingItem({ key: "k2" }));
    expect((await store.list()).length).toBe(2);

    await store.remove("k1");
    const rest = await store.list();
    expect(rest.map((i) => i.key)).toEqual(["k2"]);
  });
});

describe("enqueueCreate", () => {
  it("serializa o payload e extrai o clientUuid", async () => {
    const store = new MemoryQueueStore();
    const item = await enqueueCreate(
      { entity: "task", projectId: "p9", url: "/api/v1/projetos/p9/campo/tarefas", payload: { title: "t", clientUuid: "u-123" } },
      store
    );
    expect(item.clientUuid).toBe("u-123");
    expect(item.status).toBe("pending");
    expect(item.attempts).toBe(0);
    expect(JSON.parse(item.body)).toEqual({ title: "t", clientUuid: "u-123" });
    expect((await store.list()).length).toBe(1);
  });

  it("sem clientUuid no payload, fica undefined", async () => {
    const store = new MemoryQueueStore();
    const item = await enqueueCreate(
      { entity: "constraint", projectId: "p9", url: "/x", payload: { title: "c" } },
      store
    );
    expect(item.clientUuid).toBeUndefined();
  });
});

describe("getQueueCounts / discardFailedItems", () => {
  it("conta pending e failed e descarta apenas os failed", async () => {
    const store = new MemoryQueueStore();
    await store.put(pendingItem({ key: "a" }));
    await store.put(pendingItem({ key: "b", status: "failed" }));
    await store.put(pendingItem({ key: "c", status: "failed" }));
    expect(await getQueueCounts(store)).toEqual({ pending: 1, failed: 2 });

    await discardFailedItems(store);
    expect(await getQueueCounts(store)).toEqual({ pending: 1, failed: 0 });
    expect((await store.list()).map((i) => i.key)).toEqual(["a"]);
  });
});

describe("flushQueueWith", () => {
  it("remove em sucesso, em ordem FIFO por createdAt", async () => {
    const store = new MemoryQueueStore();
    await store.put(pendingItem({ key: "segundo", createdAt: "2026-10-29T10:00:01.000Z" }));
    await store.put(pendingItem({ key: "primeiro", createdAt: "2026-10-29T10:00:00.000Z" }));
    const sent: string[] = [];

    const result = await flushQueueWith(store, async (item) => {
      sent.push(item.key);
      return {};
    });

    expect(sent).toEqual(["primeiro", "segundo"]);
    expect(result).toEqual({ synced: 2, failed: 0, pending: 0 });
    expect(await store.list()).toEqual([]);
  });

  it("4xx marca failed e não reenvia sozinho", async () => {
    const store = new MemoryQueueStore();
    await store.put(pendingItem());

    const result = await flushQueueWith(store, async () => {
      throw new ApiError(422, "Dados inválidos", "VALIDATION_ERROR");
    });

    expect(result).toEqual({ synced: 0, failed: 1, pending: 0 });
    const [item] = await store.list();
    expect(item.status).toBe("failed");
    expect(item.attempts).toBe(1);
    expect(item.lastError).toBe("Dados inválidos");

    // um segundo flush não deve tentar reenviar o failed
    const second = await flushQueueWith(store, async () => {
      throw new Error("não deveria reenviar");
    });
    expect(second).toEqual({ synced: 0, failed: 0, pending: 0 });
  });

  it("falha de rede (status 0) interrompe o flush mantendo pending", async () => {
    const store = new MemoryQueueStore();
    await store.put(pendingItem({ key: "a", createdAt: "2026-10-29T10:00:00.000Z" }));
    await store.put(pendingItem({ key: "b", createdAt: "2026-10-29T10:00:01.000Z" }));
    let calls = 0;

    const result = await flushQueueWith(store, async () => {
      calls += 1;
      throw new ApiError(0, "Falha de conexão", "NETWORK_ERROR");
    });

    expect(calls).toBe(1); // para no primeiro item
    expect(result.pending).toBe(2);
    const [first] = await store.list();
    expect(first.status).toBe("pending");
  });

  it("5xx mantém pending com attempts++ e segue para o próximo", async () => {
    const store = new MemoryQueueStore();
    await store.put(pendingItem({ key: "a", createdAt: "2026-10-29T10:00:00.000Z" }));
    await store.put(pendingItem({ key: "b", createdAt: "2026-10-29T10:00:01.000Z" }));

    const result = await flushQueueWith(store, async (item) => {
      if (item.key === "a") throw new ApiError(503, "Servidor indisponível");
      return {};
    });

    expect(result).toEqual({ synced: 1, failed: 0, pending: 1 });
    const [only] = await store.list();
    expect(only.key).toBe("a");
    expect(only.attempts).toBe(1);
    expect(only.lastError).toBe("Servidor indisponível");
  });
});

describe("sendOrQueueCreate", () => {
  const input = {
    entity: "progress" as const,
    projectId: "p1",
    url: "/api/v1/projetos/p1/campo/medicoes",
    payload: { progressPercent: 42, clientUuid: "u-1" },
  };

  it("envia online e devolve sent", async () => {
    const send = vi.fn().mockResolvedValue({});
    await expect(sendOrQueueCreate(input, send)).resolves.toBe("sent");
    expect(send).toHaveBeenCalledWith(input.url, JSON.stringify(input.payload));
  });

  it("offline (navigator.onLine === false) enfileira sem chamar send", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const before = await getQueueCounts();
    const send = vi.fn();
    const outcome = await sendOrQueueCreate(input, send);
    expect(outcome).toBe("queued");
    expect(send).not.toHaveBeenCalled();
    const after = await getQueueCounts();
    expect(after.pending).toBe(before.pending + 1);
  });

  it("queda de rede (ApiError 0) durante o envio enfileira", async () => {
    const before = await getQueueCounts();
    const send = vi.fn().mockRejectedValue(new ApiError(0, "Falha de conexão", "NETWORK_ERROR"));
    await expect(sendOrQueueCreate(input, send)).resolves.toBe("queued");
    const after = await getQueueCounts();
    expect(after.pending).toBe(before.pending + 1);
  });

  it("4xx é relançado para a UI (não enfileira)", async () => {
    const send = vi.fn().mockRejectedValue(new ApiError(422, "Dados inválidos"));
    await expect(sendOrQueueCreate(input, send)).rejects.toThrow("Dados inválidos");
  });
});

// --- Fatia 2: fotos offline, edições de rascunho e despacho -----------------

const photoInput = {
  projectId: "p1",
  url: "/api/v1/projects/p1/field/photos",
  meta: { caption: "Fachada norte", diaryId: "d-1", clientUuid: "photo-uuid-1" },
  file: new Blob(["binario"], { type: "image/png" }),
  fileName: "fachada.png",
  mimeType: "image/png",
};

describe("enqueuePhoto (Fatia 2)", () => {
  it("persiste Blob + metadados e extrai o clientUuid", async () => {
    const store = new MemoryQueueStore();
    const item = await enqueuePhoto(photoInput, store);
    expect(item.entity).toBe("photo");
    expect(item.method).toBe("POST");
    expect(item.clientUuid).toBe("photo-uuid-1");
    expect(item.file).toBe(photoInput.file);
    expect(item.fileName).toBe("fachada.png");
    expect(item.mimeType).toBe("image/png");
    expect(JSON.parse(item.body)).toEqual(photoInput.meta);

    const counts = await getQueueCounts(store);
    expect(counts).toEqual({ pending: 1, failed: 0 });
  });
});

describe("buildFormDataFor", () => {
  it("monta multipart com file + metadados e ignora vazios", async () => {
    const store = new MemoryQueueStore();
    const item = await enqueuePhoto(
      { ...photoInput, meta: { caption: "", diaryId: "d-1", wbsNodeId: undefined, clientUuid: "photo-uuid-1" } },
      store
    );
    const form = buildFormDataFor(item);
    expect(form.get("file")).toBeTruthy();
    expect(form.get("diaryId")).toBe("d-1");
    expect(form.get("clientUuid")).toBe("photo-uuid-1");
    expect(form.get("caption")).toBeNull(); // vazio não vai no form
    expect(form.get("wbsNodeId")).toBeNull();
  });

  it("item sem arquivo lança erro claro", () => {
    expect(() =>
      buildFormDataFor({ ...pendingItem({ entity: "diary" }), file: undefined })
    ).toThrow("sem arquivo");
  });
});

describe("sendQueuedItem (despacho por tipo)", () => {
  it("foto vai para transport.upload com multipart", async () => {
    const store = new MemoryQueueStore();
    const item = await enqueuePhoto(photoInput, store);
    const upload = vi.fn().mockResolvedValue({});
    const json = vi.fn();

    await sendQueuedItem(item, { json, upload });

    expect(json).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0]).toBe(photoInput.url);
    const form = upload.mock.calls[0][1] as FormData;
    expect(form.get("clientUuid")).toBe("photo-uuid-1");
    expect(form.get("caption")).toBe("Fachada norte");
  });

  it("JSON usa o method do item (POST/PATCH; legado sem method = POST)", async () => {
    const json = vi.fn().mockResolvedValue({});
    const upload = vi.fn();

    await sendQueuedItem({ ...pendingItem(), method: "PATCH" }, { json, upload });
    expect(json).toHaveBeenCalledWith(pendingItem().url, { method: "PATCH", body: pendingItem().body });

    await sendQueuedItem(pendingItem({ key: "legado" }), { json, upload });
    expect(json).toHaveBeenLastCalledWith(pendingItem().url, { method: "POST", body: pendingItem().body });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("sendOrQueueEdit (regra de conflito: last-wins em rascunho)", () => {
  const editInput = {
    entity: "diary" as const,
    projectId: "p1",
    url: "/api/v1/projects/p1/field/diaries/d-1",
    payload: { notes: "corrigido offline" },
  };

  it("envia PATCH online e devolve sent", async () => {
    const send = vi.fn().mockResolvedValue({});
    await expect(sendOrQueueEdit(editInput, send)).resolves.toBe("sent");
    expect(send).toHaveBeenCalledWith(editInput.url, JSON.stringify(editInput.payload));
  });

  it("offline enfileira com method PATCH no item", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const send = vi.fn();
    const before = (await listQueueItems()).length;
    await expect(sendOrQueueEdit(editInput, send)).resolves.toBe("queued");
    expect(send).not.toHaveBeenCalled();
    const items = await listQueueItems();
    expect(items.length).toBe(before + 1);
    const item = items[items.length - 1]; // o recém-enfileirado
    expect(item.method).toBe("PATCH");
    expect(item.url).toBe(editInput.url);
  });

  it("4xx é relançado (revalidação do servidor não vai para a fila)", async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new ApiError(422, "Diário não editável neste status"));
    await expect(sendOrQueueEdit(editInput, send)).rejects.toThrow(
      "Diário não editável neste status"
    );
  });
});

describe("sendOrQueuePhoto (Fatia 2)", () => {
  it("envia multipart online e devolve sent", async () => {
    const send = vi.fn().mockResolvedValue({});
    await expect(sendOrQueuePhoto(photoInput, send)).resolves.toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    const form = send.mock.calls[0][1] as FormData;
    expect(form.get("clientUuid")).toBe("photo-uuid-1");
    expect(form.get("file")).toBeTruthy();
  });

  it("offline enfileira sem chamar send (Blob persistido)", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const send = vi.fn();
    await expect(sendOrQueuePhoto(photoInput, send)).resolves.toBe("queued");
    expect(send).not.toHaveBeenCalled();
    const counts = await getQueueCounts();
    expect(counts.pending).toBeGreaterThan(0);
  });

  it("queda de rede (ApiError 0) enfileira o Blob", async () => {
    const send = vi.fn().mockRejectedValue(new ApiError(0, "Falha de conexão", "NETWORK_ERROR"));
    await expect(sendOrQueuePhoto(photoInput, send)).resolves.toBe("queued");
  });

  it("4xx (ex.: arquivo rejeitado) é relançado para a UI", async () => {
    const send = vi.fn().mockRejectedValue(new ApiError(413, "Foto acima de 4 MB"));
    await expect(sendOrQueuePhoto(photoInput, send)).rejects.toThrow("Foto acima de 4 MB");
  });
});

describe("flush de fila mista (Fatia 2)", () => {
  it("processa foto e JSON em FIFO; foto remove no sucesso", async () => {
    const store = new MemoryQueueStore();
    await store.put(pendingItem({ key: "json", createdAt: "2026-10-29T10:00:00.000Z" }));
    await enqueuePhoto(photoInput, store);
    // ordena: json (10:00:00) antes da foto (enfileirada agora)
    const order: string[] = [];
    const result = await flushQueueWith(store, async (item) => {
      order.push(item.entity);
      return {};
    });
    expect(order).toEqual(["diary", "photo"]);
    expect(result).toEqual({ synced: 2, failed: 0, pending: 0 });
    expect(await store.list()).toEqual([]);
  });
});
