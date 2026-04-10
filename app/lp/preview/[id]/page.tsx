import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import LandingPageView from "@/components/landing/LandingPageView";
import { requireAdminFromCookies } from "@/lib/admin-auth";
import { getLandingBundleById } from "@/lib/landing-pages";

export const dynamic = "force-dynamic";

export default async function LandingPagePreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const adminGuard = await requireAdminFromCookies(cookies().getAll());
  if (!adminGuard.ok) {
    redirect("/admin/login");
  }

  const bundle = await getLandingBundleById(params.id);
  if (!bundle) {
    notFound();
  }

  return <LandingPageView bundle={bundle} previewMode />;
}
