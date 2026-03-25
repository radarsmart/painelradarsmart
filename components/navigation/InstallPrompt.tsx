"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    let timerId: number | null = null;

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);

      if (timerId !== null) {
        window.clearTimeout(timerId);
      }

      timerId = window.setTimeout(() => {
        setShowBanner(true);
      }, 30000);
    };

    const handleAppInstalled = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowBanner(false);
    }

    setDeferredPrompt(null);
  };

  if (pathname.startsWith("/admin") || pathname === "/links" || !showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[126] animate-bounce md:hidden">
      <div className="flex items-center justify-between rounded-2xl border-2 border-white bg-blue-600 p-4 shadow-2xl">
        <div className="flex items-center gap-3 text-white">
          <span className="text-2xl">📡</span>
          <div>
            <p className="text-sm font-black uppercase leading-tight">Instale o Radar Smart</p>
            <p className="text-[10px] opacity-90">Tenha as ofertas na palma da mao!</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleInstall();
          }}
          className="rounded-xl bg-white px-4 py-2 text-xs font-black text-blue-600 shadow-md"
        >
          INSTALAR AGORA 🚀
        </button>
      </div>
    </div>
  );
}
