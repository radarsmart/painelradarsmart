import { supabaseAdmin } from "@/lib/supabase";
import {
  getDistributionFlags,
  type DistributionFlags,
} from "@/lib/distribution/feature-flags";

export type QueueableChannel = "whatsapp" | "telegram" | "instagram";

type ScheduleInput = {
  briefingId: string;
  jobId?: string | null;
  channels?: QueueableChannel[];
  source?: string;
};

type ScheduledDistribution = {
  distributionId: string;
  scheduledPostId: string;
  channel: QueueableChannel;
  scheduledAt: string;
};

function normalizeChannels(input: unknown): QueueableChannel[] {
  if (!Array.isArray(input)) return [];
  const values = Array.from(
    new Set(input.map((entry) => String(entry ?? "").trim().toLowerCase())),
  );
  return values.filter(
    (entry): entry is QueueableChannel =>
      entry === "whatsapp" || entry === "telegram" || entry === "instagram",
  );
}

function getChannelTargets(
  channel: QueueableChannel,
  flags: DistributionFlags,
): string[] {
  if (channel === "whatsapp") return flags.channels.whatsapp.groups;
  if (channel === "telegram") return flags.channels.telegram.chats;
  return [];
}

function isChannelEnabled(channel: QueueableChannel, flags: DistributionFlags): boolean {
  if (channel === "whatsapp") return flags.channels.whatsapp.enabled;
  if (channel === "telegram") return flags.channels.telegram.enabled;
  return flags.channels.instagram.enabled;
}

function computeScheduleTime(index: number, flags: DistributionFlags): string {
  const delayMinutes = Math.max(1, flags.scheduling.delay_between_posts_minutes);
  const date = new Date(Date.now() + index * delayMinutes * 60 * 1000);
  return date.toISOString();
}

export async function scheduleTikTokDistribution(
  input: ScheduleInput,
): Promise<{
  success: boolean;
  message: string;
  scheduled: ScheduledDistribution[];
  skipped_channels: QueueableChannel[];
}> {
  const briefingId = String(input.briefingId ?? "").trim();
  if (!briefingId) {
    throw new Error("briefingId obrigatorio para distribuir.");
  }

  const flags = await getDistributionFlags();
  if (!flags.distribution_enabled) {
    return {
      success: false,
      message: "Distribuicao desativada via feature flag.",
      scheduled: [],
      skipped_channels: [],
    };
  }

  const requestedChannels = normalizeChannels(input.channels);
  const fallbackChannels: QueueableChannel[] = ["telegram", "whatsapp", "instagram"];
  const channelsToEvaluate = requestedChannels.length
    ? requestedChannels
    : fallbackChannels;

  const enabledChannels = channelsToEvaluate.filter((channel) =>
    isChannelEnabled(channel, flags),
  );
  const skippedChannels = channelsToEvaluate.filter(
    (channel) => !enabledChannels.includes(channel),
  );

  if (!enabledChannels.length) {
    return {
      success: false,
      message: "Nenhum canal habilitado para distribuicao.",
      scheduled: [],
      skipped_channels: skippedChannels,
    };
  }

  const scheduled: ScheduledDistribution[] = [];

  for (let index = 0; index < enabledChannels.length; index += 1) {
    const channel = enabledChannels[index];
    const scheduledAt = computeScheduleTime(index, flags);
    const targets = getChannelTargets(channel, flags);

    const distributionInsert = await supabaseAdmin
      .from("tiktok_engine_distributions")
      .insert({
        briefing_id: briefingId,
        job_id: input.jobId ?? null,
        channel,
        payload: {
          source: input.source ?? "manual",
          targets,
          feature_flags_snapshot: flags,
        },
        status: "scheduled",
        scheduled_at: scheduledAt,
      })
      .select("id")
      .single();

    if (distributionInsert.error || !distributionInsert.data?.id) {
      throw new Error(
        `Falha ao inserir distribuicao (${channel}): ${distributionInsert.error?.message ?? "sem id"}`,
      );
    }

    const distributionId = String(distributionInsert.data.id);

    const scheduledInsert = await supabaseAdmin
      .from("tiktok_engine_scheduled_posts")
      .insert({
        distribution_id: distributionId,
        briefing_id: briefingId,
        channel,
        scheduled_for: scheduledAt,
        post_content: null,
        media_url: null,
        status: "scheduled",
      })
      .select("id")
      .single();

    if (scheduledInsert.error || !scheduledInsert.data?.id) {
      throw new Error(
        `Falha ao inserir post agendado (${channel}): ${scheduledInsert.error?.message ?? "sem id"}`,
      );
    }

    scheduled.push({
      distributionId,
      scheduledPostId: String(scheduledInsert.data.id),
      channel,
      scheduledAt,
    });
  }

  return {
    success: true,
    message: `${scheduled.length} distribuicao(oes) agendadas.`,
    scheduled,
    skipped_channels: skippedChannels,
  };
}

export async function shouldAutoDistributeOnComplete(): Promise<boolean> {
  const flags = await getDistributionFlags();
  return flags.distribution_enabled && flags.auto_distribute_on_complete;
}
