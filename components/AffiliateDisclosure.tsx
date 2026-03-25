import { Info } from "lucide-react";

export default function AffiliateDisclosure() {
  return (
    <div className="rounded-3xl border border-[#FFC300]/20 bg-[#FFF8DB] p-5 text-sm text-[#5B4A16]">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-[#FFC300]/20 p-2">
          <Info className="h-4 w-4" />
        </div>
        <div>
          <p className="font-black uppercase tracking-widest text-[10px] text-[#8A6C10]">
            Transparencia de Afiliacao
          </p>
          <p className="mt-1 leading-relaxed">
            Alguns links deste portal podem gerar comissao para a Radar Smart. Isso nao altera o
            preco pago por voce e nos ajuda a continuar publicando reviews, comparativos e alertas
            de oferta.
          </p>
        </div>
      </div>
    </div>
  );
}
