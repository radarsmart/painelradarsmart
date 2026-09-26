import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { getJob, updateJobReview } from "@/lib/commercial-video/jobs/commercial-job-repository";
import { toApiJob } from "@/lib/commercial-video/jobs/commercial-job-view";
import { buildCommercialReviewSummary, canApproveCommercial } from "@/lib/commercial-video/review/commercial-review-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const job = await getJob(params.id);
    if (!job) {
      return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ job: toApiJob(job) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao buscar job." }, { status: 500 });
  }
}

type ReviewBody = {
  action?: "APPROVE" | "REJECT";
  reviewNotes?: string | null;
  humanAcknowledgedObservations?: boolean;
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => null)) as ReviewBody | null;
  const action = body?.action;

  if (action !== "APPROVE" && action !== "REJECT") {
    return NextResponse.json({ error: 'action precisa ser "APPROVE" ou "REJECT".' }, { status: 400 });
  }

  try {
    const job = await getJob(params.id);
    if (!job) {
      return NextResponse.json({ error: "Job nao encontrado." }, { status: 404 });
    }

    const apiJob = toApiJob(job);
    const reviewSummary = buildCommercialReviewSummary(apiJob);
    const humanAcknowledgedObservations = body?.humanAcknowledgedObservations === true;

    if (action === "APPROVE") {
      if (apiJob.status !== "COMPLETED") {
        return NextResponse.json({ error: "Aprovacao exige job COMPLETED." }, { status: 409 });
      }
      if (!canApproveCommercial(reviewSummary, humanAcknowledgedObservations)) {
        return NextResponse.json(
          {
            error: "Comercial ainda nao esta apto para aprovacao humana.",
            publishReady: reviewSummary.publishReady,
            requiresHumanAcknowledgement: reviewSummary.requiresHumanAcknowledgement,
          },
          { status: 409 },
        );
      }
    }

    const updated = await updateJobReview({
      jobId: params.id,
      reviewStatus: action === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewedByUserId: adminGuard.userId,
      reviewedByEmail: adminGuard.email,
      reviewNotes: typeof body?.reviewNotes === "string" ? body.reviewNotes.trim() || null : null,
      humanAcknowledgedObservations,
    });

    return NextResponse.json({ success: true, job: toApiJob(updated), published: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao registrar revisao." }, { status: 500 });
  }
}
