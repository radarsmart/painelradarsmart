"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  FileEdit,
  Globe,
  Loader2,
  Package,
  Search,
  Sparkles,
} from "lucide-react";

import DashboardRefreshButton from "@/components/admin/DashboardRefreshButton";
import { supabase } from "@/lib/supabase";

type SEOCardProps = {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
};

type ProductRow = {
  id: string;
  title: string;
  slug: string;
  seoHealth: number;
  keywords: string[];
  category: string;
  price: number;
  features: string[];
};

type GeneratedSEO = {
  seo_title: string;
  slug: string;
  meta_description: string;
  content_snippet: string;
  keywords: string[];
  source: "heuristic" | "ai";
};

type SEOResponse = {
  success?: boolean;
  seo?: GeneratedSEO;
  error?: string;
};

type Feedback = {
  type: "success" | "error";
  text: string;
};

const INITIAL_PRODUCTS: ProductRow[] = [
  {
    id: "iphone-15-pro-max-256",
    title: "Apple iPhone 15 Pro Max (256GB)",
    slug: "/apple-iphone-15-pro-max-melhor-preco",
    seoHealth: 85,
    keywords: ["iphone 15 barato", "promocao apple"],
    category: "Eletronicos",
    price: 8299,
    features: ["chip A17 Pro", "camera 48 MP", "256GB"],
  },
];

async function parseApiResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(raw || `Resposta invalida do servidor (HTTP ${response.status}).`);
  }
}

export default function GestaoProdutosSEO() {
  const [products, setProducts] = useState<ProductRow[]>(INITIAL_PRODUCTS);
  const [search, setSearch] = useState("");
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [latestSEO, setLatestSEO] = useState<(GeneratedSEO & { productTitle: string }) | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;

    return products.filter((product) => {
      const haystack = `${product.title} ${product.slug} ${product.keywords.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [products, search]);

  const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (error || !token) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }

    return token;
  };

  const handleAIGeneration = async (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    setLoadingProductId(productId);
    setFeedback(null);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/seo/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: product.title,
          category: product.category,
          price: product.price,
          features: product.features,
        }),
      });

      const data = await parseApiResponse<SEOResponse>(response);
      if (!response.ok || !data.seo) {
        throw new Error(data.error ?? "Falha ao gerar sugestao de SEO.");
      }

      setProducts((current) =>
        current.map((item) =>
          item.id === productId
            ? {
                ...item,
                slug: `/${data.seo?.slug ?? item.slug.replace(/^\//, "")}`,
                keywords: data.seo?.keywords?.length ? data.seo.keywords : item.keywords,
                seoHealth: Math.max(item.seoHealth, data.seo?.source === "ai" ? 96 : 91),
              }
            : item,
        ),
      );

      setLatestSEO({
        ...data.seo,
        productTitle: product.title,
      });
      setFeedback({
        type: "success",
        text:
          data.seo.source === "ai"
            ? "Sugestao de SEO gerada por IA e aplicada ao produto."
            : "Sugestao de SEO gerada pelo fallback local e aplicada ao produto.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error ? error.message : "Falha ao gerar SEO automaticamente.",
      });
    } finally {
      setLoadingProductId(null);
    }
  };

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <Package className="text-emerald-600" />
            Produtos & Autoridade SEO
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Otimize seus produtos para dominar as buscas do Google.
          </p>
        </div>

        <DashboardRefreshButton />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SEOCard
          title="Indexados"
          value="1.240"
          detail="92% do catalogo"
          icon={<CheckCircle2 className="text-emerald-500" />}
        />
        <SEOCard
          title="Sem Descricao"
          value="42"
          detail="Requer atencao"
          icon={<AlertTriangle className="text-amber-500" />}
        />
        <SEOCard
          title="Trafego Organico"
          value="15.4k"
          detail="+12% este mes"
          icon={<Globe className="text-blue-500" />}
        />
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-50 p-6">
          <h2 className="font-bold text-[#1A1A1A]">Otimizacao de Produtos</h2>

          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filtrar por nome ou SKU..."
              className="w-full rounded-xl border border-gray-100 py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-6 py-4">Produto</th>
                <th className="px-6 py-4">SEO Health</th>
                <th className="px-6 py-4">Palavras-Chave</th>
                <th className="px-6 py-4 text-right">Acao</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="group transition-colors hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-100" />
                      <div className="min-w-0">
                        <p className="max-w-[240px] truncate font-bold text-[#1A1A1A]">
                          {product.title}
                        </p>
                        <p className="font-mono text-[10px] text-gray-400">{product.slug}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${Math.max(0, Math.min(product.seoHealth, 100))}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600">
                        {product.seoHealth}%
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {product.keywords.map((keyword) => (
                        <span
                          key={`${product.id}-${keyword}`}
                          className="rounded-md bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-600"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-1.5 text-[10px] font-bold text-purple-600 shadow-sm transition-all hover:bg-purple-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void handleAIGeneration(product.id)}
                        disabled={loadingProductId !== null}
                      >
                        {loadingProductId === product.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Sparkles size={12} />
                        )}
                        Sugerir SEO via IA
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-gray-400 transition-all hover:bg-emerald-50 hover:text-emerald-600"
                        title="Editar SEO"
                      >
                        <FileEdit size={16} />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-gray-400 transition-all hover:bg-blue-50 hover:text-blue-600"
                        title="Ver no Blog"
                      >
                        <Eye size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {feedback ? (
        <div
          className={`rounded-3xl border px-5 py-4 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {latestSEO ? (
        <div className="rounded-3xl bg-[#1A1A1A] p-6 text-white shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            Ultima sugestao aplicada
          </p>
          <h3 className="mt-2 text-xl font-bold">{latestSEO.productTitle}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">SEO Title</p>
              <p className="text-sm text-gray-200">{latestSEO.seo_title}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Slug</p>
              <p className="font-mono text-sm text-emerald-300">/{latestSEO.slug}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Meta Description
              </p>
              <p className="text-sm text-gray-200">{latestSEO.meta_description}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Content Snippet
              </p>
              <p className="text-sm text-gray-200">{latestSEO.content_snippet}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SEOCard({ title, value, detail, icon }: SEOCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-white p-6 shadow-sm">
      <div className="rounded-2xl bg-gray-50 p-3">{icon}</div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</p>
        <h3 className="text-xl font-black leading-tight text-[#1A1A1A]">{value}</h3>
        <p className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-600">
          <ArrowUpRight size={12} />
          {detail}
        </p>
      </div>
    </div>
  );
}
