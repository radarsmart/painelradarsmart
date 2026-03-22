"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;

    const validate = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error || !data.session) {
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

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-rs-muted">
        Validando sessao...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <AdminSidebar />
      <main className="w-full flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
