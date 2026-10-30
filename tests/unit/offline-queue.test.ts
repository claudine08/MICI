// Testes da fila offline de criações de campo (E12 backlog §4 — Fatia 1).

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
  discardFailedItems,
  enqueueCreate,
  flushQueueWith,
  getQueueCounts,
  MemoryQueueStore,
  sendOrQueueCreate,
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
