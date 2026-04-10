"use client";

import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function GrupoPage() {
  const [canal, setCanal] = useState("whatsapp");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const entrar = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/grupo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, origem: "landing_grupo" }),
      });
      if (!res.ok) throw new Error("Falha ao registrar entrada no grupo");
      setStatus("Registro realizado. Abrindo canal...");
      window.open(
        canal === "whatsapp" ? "https://www.whatsapp.com/" : "https://t.me/",
        "_blank",
        "noopener,noreferrer",
      );
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 md:py-10">
        <section className="rounded-2xl border border-rs-border bg-white p-5 shadow-card sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange">
            Atencao
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-navy sm:text-4xl">
            Entre para o grupo Radar Smart
          </h1>
          <p className="mt-3 text-sm text-rs-muted">
            Receba ofertas validadas, comparativos rapidos e alertas de virada de
            preco direto no seu canal.
          </p>

          <div className="mt-6">
            <p className="text-sm font-semibold text-navy">Canal preferido</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setCanal("whatsapp")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold sm:min-w-[140px] ${
                  canal === "whatsapp"
                    ? "bg-rs-green text-white"
                    : "border border-rs-border bg-white text-navy"
                }`}
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setCanal("telegram")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold sm:min-w-[140px] ${
                  canal === "telegram"
                    ? "bg-navy text-white"
                    : "border border-rs-border bg-white text-navy"
                }`}
              >
                Telegram
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={entrar}
            disabled={loading}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-orange px-5 py-3 text-sm font-semibold text-white hover:bg-orange-2 disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Processando..." : "Entrar agora"}
          </button>

          {status ? <p className="mt-3 text-xs text-rs-muted">{status}</p> : null}
        </section>
      </main>
      <Footer />
    </>
  );
}
