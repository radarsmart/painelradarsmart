import CardOferta, { OfertaCard } from "./CardOferta";

export default function GridOfertas({ offers }: { offers: OfertaCard[] }) {
  if (offers.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
        Nenhuma oferta disponível neste filtro.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {offers.map((offer) => (
        <CardOferta key={offer.id} offer={offer} />
      ))}
    </div>
  );
}
