import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"),
    );

  if (!hasAuthCookie) redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-slate-100">
      <AdminSidebar />
      <main className="w-full flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
