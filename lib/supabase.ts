import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co";
const supabaseAnon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "public-anon-key";
const supabaseService =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "service-role-key";

export const supabase = createClient(supabaseUrl, supabaseAnon);

export const supabaseAdmin = createClient(supabaseUrl, supabaseService, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const getDestaques = async (limit = 5) =>
  (await supabaseAdmin.from("radar_smart_boost").select("*").limit(limit)).data ??
  [];

export const getOfertas = async (limit = 20, categoria?: string) => {
  let query = supabaseAdmin.from("radar_smart_rank").select("*").limit(limit);
  if (categoria) query = query.eq("category_slug", categoria);
  return (await query).data ?? [];
};

export const getCategorias = async () =>
  (
    await supabaseAdmin
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("sort_order")
  ).data ?? [];

export const getHistoricoPreco = async (offerId: string) =>
  (
    await supabaseAdmin
      .from("price_history")
      .select("*")
      .eq("offer_id", offerId)
      .order("recorded_at", { ascending: true })
      .limit(90)
  ).data ?? [];

export const getBlogPosts = async (limit = 10) =>
  (
    await supabaseAdmin
      .from("blog_posts")
      .select("*")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(limit)
  ).data ?? [];

export const registrarClique = async (offerId: string, source: string) =>
  supabase
    .from("clicks")
    .insert({ offer_id: offerId, type: "product_click", source });

export const registrarGrupo = async (canal: string, origem: string) =>
  supabase.from("grupo_membros").insert({ canal, origem });

export const salvarOferta = async (oferta: Record<string, unknown>) =>
  supabaseAdmin.from("offers").upsert(oferta).select().single();

export const toggleOferta = async (id: string, ativo: boolean) =>
  supabaseAdmin
    .from("offers")
    .update({ status: ativo ? "active" : "inactive" })
    .eq("id", id);

export const deletarOferta = async (id: string) =>
  supabaseAdmin.from("offers").delete().eq("id", id);

export const getDashboardStats = async () => {
  const [cliques, receita, fila, membros] = await Promise.all([
    supabaseAdmin.from("clicks").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("v_revenue_by_marketplace").select("*"),
    supabaseAdmin
      .from("post_queue")
      .select("status")
      .in("status", ["queued", "failed"]),
    supabaseAdmin
      .from("grupo_membros")
      .select("*", { count: "exact", head: true }),
  ]);

  return {
    totalCliques: cliques.count ?? 0,
    receita: receita.data ?? [],
    filaQueued: fila.data?.filter((x: { status: string }) => x.status === "queued")
      .length ?? 0,
    filaFailed: fila.data?.filter((x: { status: string }) => x.status === "failed")
      .length ?? 0,
    totalMembros: membros.count ?? 0,
  };
};
