"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Loader2, Send, CheckCircle2, AlertCircle } from "lucide-react";

type TelegramState = { ok: boolean; message: string } | null;

type ServerAction = (
  prevState: TelegramState,
  formData: FormData,
) => Promise<TelegramState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-bold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
      {pending ? "Enviando..." : "Enviar para Telegram"}
    </button>
  );
}

export default function CuradoriaTelegramButton({
  offerId,
  affiliateUrl,
  action,
}: {
  offerId: string;
  affiliateUrl: string;
  action: ServerAction;
}) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="id" value={offerId} />
      <input type="hidden" name="affiliate_url" value={affiliateUrl} />
      <SubmitButton />
      {state && (
        <p
          className={`flex items-center gap-1 text-xs font-semibold ${
            state.ok ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {state.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          {state.message}
        </p>
      )}
    </form>
  );
}
