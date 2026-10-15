import { NextRequest, NextResponse } from "next/server";
import { requireAccount } from "@/lib/account-server";
import { RequestError, errorResponse } from "@/lib/evidence-validation";
import { getKillswitches, setKillswitch } from "@/lib/ops";

export async function GET() {
  return NextResponse.json({
    killswitches: getKillswitches(),
    operations: {
      operator_owner: "Civic Infrastructure Operations Lead",
      alert_sink: "ops-alerts@theroadproblem.quest",
      budget_cap_inr_monthly: 2500,
      staging_env: process.env.NODE_ENV || "development",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const account = await requireAccount(req);
    if (account.role !== "admin")
      throw new RequestError("Administrator access required.", 403);
    const body = await req.json();

    if (typeof body.submissions_enabled === "boolean") {
      setKillswitch("submissions_enabled", body.submissions_enabled);
    }
    if (typeof body.ingestion_enabled === "boolean") {
      setKillswitch("ingestion_enabled", body.ingestion_enabled);
    }

    return NextResponse.json({
      success: true,
      killswitches: getKillswitches(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
