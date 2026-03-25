import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveSiteUrl } from "@/lib/site";

type SitemapOfferRow = {
  id: string | null;
  updated_at?: string | null;
};

type SitemapBlogRow = {
  slug: string | null;
  status?: string | null;
  is_published?: boolean | null;
  published_at?: string | null;
  updated_at?: string | null;
};

export const revalidate = 300;

function toDate(value: string | null | undefined): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = resolveSiteUrl();

  const [offersRes, blogPostsRes] = await Promise.all([
    supabaseAdmin
      .from("offers")
      .select("id,updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("blog_posts")
      .select("slug,status,is_published,published_at,updated_at")
      .not("slug", "is", null)
      .order("published_at", { ascending: false })
      .limit(2000),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${siteUrl}/ofertas`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/comparativo`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/grupo`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ];

  const offerRoutes: MetadataRoute.Sitemap = ((offersRes.data ?? []) as SitemapOfferRow[])
    .filter((offer) => Boolean(offer.id))
    .map((offer) => ({
      url: `${siteUrl}/ofertas/${offer.id}`,
      lastModified: toDate(offer.updated_at),
      changeFrequency: "hourly" as const,
      priority: 0.85,
    }));

  const blogRoutes: MetadataRoute.Sitemap = ((blogPostsRes.data ?? []) as SitemapBlogRow[])
    .filter(
      (post) =>
        Boolean(post.slug) &&
        (String(post.status ?? "").toLowerCase() === "published" ||
          post.is_published === true),
    )
    .map((post) => ({
      url: `${siteUrl}/blog/${post.slug}`,
      lastModified: toDate(post.updated_at ?? post.published_at),
      changeFrequency: "daily" as const,
      priority: 0.75,
    }));

  return [...staticRoutes, ...offerRoutes, ...blogRoutes];
}
