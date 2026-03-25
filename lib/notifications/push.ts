type PushNotificationInput = {
  title: string;
  body: string;
  url: string;
  icon?: string;
};

type PushNotificationResult = {
  ok: boolean;
  skipped: boolean;
  status?: number;
  reason?: string;
};

const PUSH_WEBHOOK_URL = process.env.PUSH_NOTIFICATION_WEBHOOK_URL?.trim() || "";

export async function sendPushNotification(
  input: PushNotificationInput,
): Promise<PushNotificationResult> {
  if (!PUSH_WEBHOOK_URL) {
    console.info("Push skipped: PUSH_NOTIFICATION_WEBHOOK_URL nao configurada.", {
      title: input.title,
      url: input.url,
    });
    return {
      ok: false,
      skipped: true,
      reason: "missing_webhook",
    };
  }

  const response = await fetch(PUSH_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      skipped: false,
      status: response.status,
      reason: body || "push_provider_error",
    };
  }

  return {
    ok: true,
    skipped: false,
    status: response.status,
  };
}
