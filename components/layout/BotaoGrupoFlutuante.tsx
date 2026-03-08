import Link from "next/link";
import { MessageCircle } from "lucide-react";

export default function BotaoGrupoFlutuante() {
  return (
    <Link
      href="/grupo"
      className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-rs-green px-4 py-3 text-sm font-semibold text-white shadow-card transition hover:brightness-95"
    >
      <MessageCircle className="h-4 w-4" />
      Entrar no Grupo
    </Link>
  );
}
