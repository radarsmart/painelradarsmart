"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

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
    <main className="flex min-h-screen items-center justify-center bg-[#0D0D0D] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/logo-radar-smart.png"
            alt="Radar Smart"
            width={72}
            height={72}
            className="h-[72px] w-[72px]"
            priority
          />
          <span className="text-2xl font-bold tracking-tighter text-white">
            RADAR <span className="text-[#FFC300]">SMART</span>
          </span>
        </div>

        <form
          onSubmit={onSubmit}
          className="w-full rounded-2xl border border-white/10 bg-[#1A1A1A] p-8 shadow-2xl"
        >
          <h1 className="text-xl font-bold text-white">Acesso ao painel</h1>
          <p className="mt-1 text-sm text-gray-400">
            Entre com suas credenciais de administrador
          </p>

          <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#FFC300]"
            />
          </label>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Senha
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#FFC300]"
            />
          </label>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-[#FFC300] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#e6b000] disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
