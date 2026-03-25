import CardOferta, { OfertaCard } from "./CardOferta";

export default function GridOfertas({ offers }: { offers: OfertaCard[] }) {
  if (offers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-rs-border bg-white p-6 text-sm text-rs-muted">
        Nenhuma oferta disponível neste filtro.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-2 md:grid-cols-3 md:gap-4 md:p-6 lg:grid-cols-4 xl:grid-cols-5">
      {offers.map((offer) => (
        <CardOferta key={offer.id} offer={offer} />
      ))}
    </div>
  );
}
