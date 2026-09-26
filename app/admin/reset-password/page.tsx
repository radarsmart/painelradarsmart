"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasSession(Boolean(data.session));
      setCheckingSession(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas nao coincidem.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setSuccess(true);
      await supabase.auth.signOut();
      setTimeout(() => router.replace("/admin/login"), 2000);
    } catch (err) {
      setError((err as Error).message);
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

        <div className="w-full rounded-2xl border border-white/10 bg-[#1A1A1A] p-8 shadow-2xl">
          <h1 className="text-xl font-bold text-white">Definir nova senha</h1>
          <p className="mt-1 text-sm text-gray-400">
            Escolha uma nova senha para acessar o painel
          </p>

          {checkingSession ? (
            <p className="mt-6 text-sm text-gray-400">Verificando link de redefinicao...</p>
          ) : !hasSession ? (
            <div className="mt-6 space-y-3">
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                Este link de redefinicao expirou ou ja foi usado. Peca um novo
                link de recuperacao de senha.
              </p>
              <button
                type="button"
                onClick={() => router.replace("/admin/login")}
                className="w-full rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/5"
              >
                Voltar para o login
              </button>
            </div>
          ) : success ? (
            <p className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              Senha atualizada com sucesso. Redirecionando para o login...
            </p>
          ) : (
            <form onSubmit={onSubmit}>
              <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Nova senha
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#FFC300]"
                />
              </label>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Confirmar senha
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                {loading ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
