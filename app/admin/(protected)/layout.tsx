"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import {
  getDefaultAdminPathForRole,
  isPathAllowedForRole,
} from "@/lib/admin-permissions";
import { AdminRoleProvider, type AdminIdentity } from "@/lib/admin-role-context";
import { supabase } from "@/lib/supabase-browser";

export const dynamic = "force-dynamic";

function shouldBypassAdminAuth(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]"
  );
}

export default function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);
  const [identity, setIdentity] = useState<AdminIdentity>({
    email: null,
    role: "admin",
  });

  useEffect(() => {
    let active = true;

    if (shouldBypassAdminAuth()) {
      setIsReady(true);
      return () => {
        active = false;
      };
    }

    const validate = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error || !data.session) {
        router.replace("/admin/login");
        return;
      }

      try {
        const response = await fetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        if (!active) return;

        if (!response.ok) {
          router.replace("/admin/login");
          return;
        }

        const me = (await response.json().catch(() => ({}))) as {
          email?: string | null;
          role?: string;
        };
        setIdentity({ email: me.email ?? null, role: me.role ?? "admin" });
      } catch {
        if (!active) return;
        router.replace("/admin/login");
        return;
      }

      setIsReady(true);
    };

    validate();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        if (!session) {
          setIsReady(false);
          router.replace("/admin/login");
        }
      },
    );

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!isReady) return;
    if (isPathAllowedForRole(identity.role, pathname)) return;

    router.replace(getDefaultAdminPathForRole(identity.role));
  }, [isReady, identity.role, pathname, router]);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-rs-muted">
        Validando sessao...
      </div>
    );
  }

  return (
    <AdminRoleProvider value={identity}>
      <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
        <AdminSidebar user={identity} />
        <main className="w-full flex-1 p-4 pt-20 md:p-6 lg:pt-6">{children}</main>
      </div>
    </AdminRoleProvider>
  );
}
