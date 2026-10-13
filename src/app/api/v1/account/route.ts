import { cookies } from "next/headers";
import {
  authRequest,
  setSession,
  clearSession,
  requireAccount,
} from "@/lib/account-server";
import {
  errorResponse,
  RequestError,
  sameOrigin,
  text,
} from "@/lib/evidence-validation";

export async function GET(req: Request) {
  try {
    return Response.json(
      { account: await requireAccount(req) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RequestError && error.status === 401)
      return Response.json(
        { account: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await req.json();
    const email = text(body.email, "Email", 3, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new RequestError("Enter a valid email address.");
    if (body.action === "send") {
      await authRequest("otp", {
        email,
        create_user: true,
        data: {
          display_name: text(
            body.display_name || "Community contributor",
            "Display name",
            2,
            60,
          ),
        },
      });
      return Response.json({ sent: true });
    }
    if (body.action !== "verify")
      throw new RequestError("Unknown sign-in action.");
    const token = text(body.code, "Code", 6, 8);
    if (!/^\d{6,8}$/.test(token))
      throw new RequestError("Enter the code from your email.");
    const session = await authRequest("verify", {
      email,
      token,
      type: "email",
    });
    if (!session.access_token || !session.refresh_token)
      throw new RequestError(
        "Unable to establish your session. Please request a new code.",
        401,
      );
    await setSession(session);
    return Response.json({ verified: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const token = (await cookies()).get("trp_access")?.value;
    if (token) {
      // Revoke the session when possible; always remove cookies locally.
      try {
        await authRequest("logout", {}, token);
      } catch {
        /* provider unavailable */
      }
    }
    await clearSession();
    return Response.json({ signed_out: true });
  } catch (error) {
    return errorResponse(error);
  }
}
