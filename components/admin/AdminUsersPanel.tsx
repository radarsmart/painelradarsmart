"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldOff, Users } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";

type AdminUser = {
  id: string;
  email: string;
  role: string;
  roleLabel: string;
  isSelf: boolean;
};

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  return token;
}

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Falha na requisicao (${response.status}).`);
  }
  return payload;
}

export default function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadUsers() {
    setLoading(true);
    try {
      const payload = await adminFetch<{ users: AdminUser[] }>("/api/admin/users");
      setUsers(payload.users ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function handleRevoke(user: AdminUser) {
    setRevoking(user.id);
    setMessage("");
    setError("");
    try {
      await adminFetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      setMessage(`Acesso de ${user.email} revogado.`);
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao revogar acesso.");
    } finally {
      setRevoking(null);
      setConfirmingId(null);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-slate-500" />
        <h2 className="text-lg font-black text-slate-900">Usuarios do painel</h2>
      </div>

      <p className="mb-5 text-sm text-slate-500">
        Quem tem acesso ao painel admin e com qual nivel de permissao. Revogar
        remove o acesso ao painel imediatamente (a pessoa continua com a conta
        no Supabase, so perde a entrada).
      </p>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Nivel</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {user.email}
                    {user.isSelf ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                        Voce
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.roleLabel}</td>
                  <td className="px-4 py-3 text-right">
                    {user.isSelf ? null : confirmingId === user.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-slate-500">Tem certeza?</span>
                        <button
                          type="button"
                          onClick={() => void handleRevoke(user)}
                          disabled={revoking === user.id}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                        >
                          {revoking === user.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Confirmar"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          disabled={revoking === user.id}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(user.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
                      >
                        <ShieldOff className="h-3.5 w-3.5" />
                        Revogar acesso
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!users.length ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-slate-500">
                    Nenhum usuario cadastrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
