import GarimparDispatchWizard from "@/components/admin/GarimparDispatchWizard";

export default function GarimparDisparoPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold text-navy">Disparo</h1>
        <p className="mt-1 text-sm text-rs-muted">
          Ofertas &rarr; Mensagem &rarr; Destinos. Usa o mesmo mecanismo de distribuicao da Central de Oferta.
        </p>
      </div>

      <GarimparDispatchWizard />
    </div>
  );
}
