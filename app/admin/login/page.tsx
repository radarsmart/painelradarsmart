"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        router.replace("/admin");
      }
    });
    return () => {
      mounted = false;
    };
  }, [router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      router.push("/admin");
      router.refresh();
    } catch (err) {
      const message = (err as Error).message;
      if (message.toLowerCase().includes("failed to fetch")) {
        setError(
          "Falha de conexao com Supabase. Verifique NEXT_PUBLIC_SUPABASE_URL/ANON_KEY e reinicie o servidor.",
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-3 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-rs-border bg-white p-6 shadow-card"
      >
        <h1 className="font-display text-2xl font-bold text-navy">Admin Login</h1>
        <p className="mt-1 text-sm text-rs-muted">Acesso ao painel Radar Smart</p>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-rs-muted">
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange"
          />
        </label>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-rs-muted">
          Senha
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange"
          />
        </label>

        {error ? <p className="mt-3 text-xs text-rs-red">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-2 disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
