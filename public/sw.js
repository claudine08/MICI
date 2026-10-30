// Service worker — E12 backlog §4, Fatia 1 (cache de shell).
//
// Estratégia simples e segura para o MICI:
//   - /_next/static/* (assets com hash) → cache-first (imutáveis);
//   - navegações HTML → network-first com fallback ao cache (shell offline
//     para páginas já visitadas);
//   - /api/* e demais requisições → sempre rede (a fila offline cuida das
//     criações; leituras stale não são cacheadas por segurança de sessão);
//   - nunca intercepta não-GET.
// Versionar CACHE a cada mudança neste arquivo.

const CACHE = "mici-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })()
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response("MICI — indisponível offline. Tente novamente quando a conexão voltar.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
  }
});
