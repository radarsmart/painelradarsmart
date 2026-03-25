"use client";

type CuradoriaCopyButtonProps = {
  offerId: string;
  title: string;
  price: number;
};

export default function CuradoriaCopyButton({
  offerId,
  title,
  price,
}: CuradoriaCopyButtonProps) {
  const handleCopy = async () => {
    const radarLink = `https://www.radarsmart.com.br/go/${offerId}`;
    const whatsappCopy = [
      `🔥 *${title}*`,
      "",
      `💰 Por apenas: *R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*`,
      `🛒 Compre aqui: ${radarLink}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(whatsappCopy);
      window.alert("✅ Copy completa copiada para o WhatsApp!");
    } catch {
      window.alert("⚠️ Nao foi possivel copiar automaticamente.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-xs font-black uppercase tracking-tighter text-white shadow-sm transition-all hover:bg-green-600"
    >
      <span>📲 COPIAR PARA WHATSAPP</span>
    </button>
  );
}
