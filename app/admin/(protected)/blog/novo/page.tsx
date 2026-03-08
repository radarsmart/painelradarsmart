export default function AdminNovoPostPage() {
  return (
    <div className="rounded-xl border border-rs-border bg-white p-6">
      <h1 className="font-display text-3xl font-bold text-navy">Novo post</h1>
      <p className="mt-2 text-sm text-rs-muted">
        Estrutura pronta. Próximo passo: ligar este formulário ao endpoint de
        criação de `blog_posts` no Supabase.
      </p>
      <div className="mt-4 rounded-lg border border-dashed border-rs-border p-4 text-sm text-rs-muted">
        Campos sugeridos: título, slug, categoria, conteúdo HTML/Markdown, SEO
        title/description, publicado.
      </div>
    </div>
  );
}
