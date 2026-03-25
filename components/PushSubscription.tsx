"use client";

import { useEffect } from "react";

export function PushSubscription() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const registerWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        console.log("Radar Smart: Sistema de Notificacoes pronto.", registration.scope);
      } catch (error) {
        console.error("Radar Smart: falha ao registrar o service worker.", error);
      }
    };

    void registerWorker();
  }, []);

  const subscribeUser = async () => {
    if (!("Notification" in globalThis)) {
      globalThis.alert("Este navegador nao suporta notificacoes.");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      globalThis.alert("Boa! Agora voce recebera as melhores ofertas em primeira mao.");
      return;
    }

    if (permission === "denied") {
      globalThis.alert("As notificacoes foram bloqueadas neste navegador.");
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        void subscribeUser();
      }}
      className="fixed bottom-24 left-4 z-[125] rounded-full bg-blue-600 p-4 text-white shadow-2xl transition-all hover:scale-110 md:bottom-6 md:left-6"
      aria-label="Receber alertas"
    >
      Receber Alertas
    </button>
  );
}
