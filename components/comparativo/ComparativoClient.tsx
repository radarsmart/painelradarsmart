"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowRightLeft } from "lucide-react";
import ProductSearchCombobox from "./ProductSearchCombobox";
import AiVerdict from "./AiVerdict";
import BotaoAfiliado from "@/components/ui/BotaoAfiliado";
import { formatBRL } from "@/lib/formatters";

export type CompareOffer = {
  id: string;
  title: string;
  marketplace: string;
  price: number;
  oldPrice: number | null;
  discountPct: number;
  rating: number | null;
  imageUrl: string | null;
  affiliateUrl: string;
  category: string | null;
};

type ComparativoClientProps = {
  offers: CompareOffer[];
};

function renderText(value: string | number | null, fallback = "-") {
  if (value === null) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  return value;
}

export default function ComparativoClient({ offers }: ComparativoClientProps) {
  const [leftId, setLeftId] = useState<string | null>(offers[0]?.id ?? null);
  const [rightId, setRightId] = useState<string | null>(offers[1]?.id ?? null);

  const left = useMemo(
    () => offers.find((item) => item.id === leftId) ?? null,
    [leftId, offers],
  );
  const right = useMemo(
    () => offers.find((item) => item.id === rightId) ?? null,
    [offers, rightId],
  );

  if (offers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        Ainda nao ha ofertas ativas suficientes para comparacao.
      </div>
    );
  }

  const comparisonRows = [
    {
      label: "Titulo",
      left: renderText(left?.title ?? null),
      right: renderText(right?.title ?? null),
    },
    {
      label: "Preco atual",
      left: left ? formatBRL(left.price) : "-",
      right: right ? formatBRL(right.price) : "-",
    },
    {
      label: "Desconto",
      left: left ? `${left.discountPct}% OFF` : "-",
      right: right ? `${right.discountPct}% OFF` : "-",
    },
    {
      label: "Marketplace",
      left: renderText(left?.marketplace ?? null),
      right: renderText(right?.marketplace ?? null),
    },
    {
      label: "Nota/Rating",
      left: left?.rating ? left.rating.toFixed(1) : "-",
      right: right?.rating ? right.rating.toFixed(1) : "-",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card md:grid-cols-2 md:p-5">
        <ProductSearchCombobox
          label="Produto A"
          placeholder="Digite para buscar produto..."
          options={offers}
          value={leftId}
          onChange={setLeftId}
          excludedId={rightId}
        />
        <ProductSearchCombobox
          label="Produto B"
          placeholder="Digite para buscar produto..."
          options={offers}
          value={rightId}
          onChange={setRightId}
          excludedId={leftId}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
          <ArrowRightLeft className="h-4 w-4 text-[#9e6a18]" />
          Comparacao lado a lado
        </div>

        <div className="space-y-4 p-4 md:hidden">
          <div className="grid gap-4">
            {[left, right].map((offer, index) => (
              <div
                key={offer?.id ?? `mobile-product-${index}`}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Produto {index === 0 ? "A" : "B"}
                </p>

                {offer ? (
                  <>
                    <div className="mb-4 flex items-start gap-3">
                      <Image
                        src={offer.imageUrl || "/next.svg"}
                        alt={offer.title}
                        width={160}
                        height={160}
                        className="h-20 w-20 rounded-xl border border-slate-200 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-3 text-sm font-semibold text-slate-800">
                          {offer.title}
                        </p>
                        <p className="mt-2 font-mono text-xl font-black text-[#22223B]">
                          {formatBRL(offer.price)}
                        </p>
                      </div>
                    </div>

                    <BotaoAfiliado
                      offerId={offer.id}
                      href={offer.affiliateUrl}
                      source={index === 0 ? "comparativo_cta_a_mobile" : "comparativo_cta_b_mobile"}
                      label="COMPRAR AGORA"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#9e6a18] px-4 py-3 text-sm font-extrabold tracking-wide text-white transition hover:brightness-110"
                    />
                  </>
                ) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-400">
                    Selecione um produto.
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid gap-3">
            {comparisonRows.map((row) => (
              <div key={row.label} className="rounded-2xl border border-slate-200 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {row.label}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Produto A
                    </p>
                    <p className="text-sm font-medium text-slate-800">{row.left}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Produto B
                    </p>
                    <p className="text-sm font-medium text-slate-800">{row.right}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Criterio</th>
                <th className="px-4 py-3">Produto A</th>
                <th className="px-4 py-3">Produto B</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-600">Imagem</td>
                <td className="px-4 py-3">
                  {left ? (
                    <Image
                      src={left.imageUrl || "/next.svg"}
                      alt={left.title}
                      width={220}
                      height={140}
                      className="h-24 w-28 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <span className="text-slate-400">Selecione</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {right ? (
                    <Image
                      src={right.imageUrl || "/next.svg"}
                      alt={right.title}
                      width={220}
                      height={140}
                      className="h-24 w-28 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <span className="text-slate-400">Selecione</span>
                  )}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-600">Titulo</td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {renderText(left?.title ?? null)}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {renderText(right?.title ?? null)}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-600">Preco atual</td>
                <td className="px-4 py-3 font-mono text-lg font-bold text-[#22223B]">
                  {left ? formatBRL(left.price) : "-"}
                </td>
                <td className="px-4 py-3 font-mono text-lg font-bold text-[#22223B]">
                  {right ? formatBRL(right.price) : "-"}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-600">Desconto</td>
                <td className="px-4 py-3">
                  {left ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                      {left.discountPct}% OFF
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">
                  {right ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                      {right.discountPct}% OFF
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-600">Marketplace</td>
                <td className="px-4 py-3">{renderText(left?.marketplace ?? null)}</td>
                <td className="px-4 py-3">{renderText(right?.marketplace ?? null)}</td>
              </tr>

              <tr>
                <td className="px-4 py-3 font-semibold text-slate-600">Nota/Rating</td>
                <td className="px-4 py-3">
                  {left?.rating ? left.rating.toFixed(1) : "-"}
                </td>
                <td className="px-4 py-3">
                  {right?.rating ? right.rating.toFixed(1) : "-"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <AiVerdict offerA={left} offerB={right} />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Produto A
          </p>
          <h3 className="line-clamp-2 text-base font-bold text-[#22223B]">
            {left?.title ?? "Selecione um produto"}
          </h3>
          <p className="mt-2 font-mono text-2xl font-extrabold text-[#22223B]">
            {left ? formatBRL(left.price) : "-"}
          </p>
          {left ? (
            <BotaoAfiliado
              offerId={left.id}
              href={left.affiliateUrl}
              source="comparativo_cta_a"
              label="COMPRAR AGORA"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#9e6a18] px-5 py-3 text-sm font-extrabold tracking-wide text-white transition hover:brightness-110"
            />
          ) : (
            <button
              type="button"
              disabled
              className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500"
            >
              COMPRAR AGORA
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Produto B
          </p>
          <h3 className="line-clamp-2 text-base font-bold text-[#22223B]">
            {right?.title ?? "Selecione um produto"}
          </h3>
          <p className="mt-2 font-mono text-2xl font-extrabold text-[#22223B]">
            {right ? formatBRL(right.price) : "-"}
          </p>
          {right ? (
            <BotaoAfiliado
              offerId={right.id}
              href={right.affiliateUrl}
              source="comparativo_cta_b"
              label="COMPRAR AGORA"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#9e6a18] px-5 py-3 text-sm font-extrabold tracking-wide text-white transition hover:brightness-110"
            />
          ) : (
            <button
              type="button"
              disabled
              className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500"
            >
              COMPRAR AGORA
            </button>
          )}
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Os precos podem variar por regiao e metodo de pagamento. Sempre confirme as
        condicoes na loja oficial antes de finalizar.
      </p>
    </div>
  );
}
