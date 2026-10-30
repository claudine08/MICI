"use client";

import { useEffect } from "react";

// Registra o service worker (PWA/offline — E12 backlog §4). Em dev o cache
// atrapalha o HMR, então só registra em produção.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA é progressive enhancement — falha silenciosa.
    });
  }, []);
  return null;
}
