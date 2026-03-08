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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {offers.map((offer) => (
        <CardOferta key={offer.id} offer={offer} />
      ))}
    </div>
  );
}
