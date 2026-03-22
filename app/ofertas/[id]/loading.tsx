export default function OfertaDetalheLoading() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <main className="mx-auto max-w-7xl animate-pulse px-4 py-8">
        <div className="h-4 w-80 rounded bg-slate-200" />

        <section className="mt-6 grid gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="h-[520px] rounded-3xl border border-slate-200 bg-white" />
            <div className="h-16 rounded-2xl bg-emerald-100" />
          </div>

          <div className="space-y-5">
            <div className="h-7 w-44 rounded-full bg-amber-100" />
            <div className="h-16 w-full rounded-2xl bg-slate-200" />

            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="h-12 w-52 rounded bg-slate-200" />
              <div className="mt-3 h-6 w-32 rounded bg-slate-200" />
              <div className="mt-6 h-12 w-full rounded-2xl bg-[#9e6a18]/20" />
              <div className="mt-3 h-11 w-full rounded-2xl bg-slate-100" />
            </div>

            <div className="h-28 rounded-3xl bg-amber-100/60" />
          </div>
        </section>

        <section className="mt-16 border-t border-slate-200 pt-12">
          <div className="h-8 w-56 rounded bg-slate-200" />
          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="h-14 border-b border-slate-100 bg-slate-50" />
            <div className="h-14 border-b border-slate-100 bg-white" />
            <div className="h-14 border-b border-slate-100 bg-slate-50" />
            <div className="h-14 bg-white" />
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-5 h-8 w-64 rounded bg-slate-200" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`related-skeleton-${i}`}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="h-40 w-full rounded-xl bg-slate-200" />
                <div className="mt-3 h-4 w-full rounded bg-slate-200" />
                <div className="mt-2 h-4 w-5/6 rounded bg-slate-200" />
                <div className="mt-4 h-8 w-1/2 rounded bg-slate-200" />
                <div className="mt-4 h-9 w-full rounded-lg bg-slate-200" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

