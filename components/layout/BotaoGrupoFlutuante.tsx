import { MessageCircle } from "lucide-react";

export default function BotaoGrupoFlutuante() {
  const groupUrl = "https://chat.whatsapp.com/G5fdVL51Zr94XDoqOexP9d";

  return (
    <a
      href={groupUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed inset-x-4 bottom-4 z-[120] inline-flex items-center justify-center gap-2 rounded-2xl bg-rs-green px-4 py-3 text-sm font-semibold text-white shadow-card transition hover:brightness-95 md:hidden"
    >
      <MessageCircle className="h-4 w-4" />
      Entrar no Grupo
    </a>
  );
}
