import { cookies } from "next/headers";
import { query } from "../db/client";
import { RequestError, sameOrigin } from "./evidence-validation";

import { authRequest } from "./auth-provider";
export { authConfig, authRequest } from "./auth-provider";

export async function setSession(session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  const jar = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  jar.set("trp_access", session.access_token, {
    ...options,
    maxAge: Math.max(60, session.expires_in || 3600),
  });
  jar.set("trp_refresh", session.refresh_token, {
    ...options,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete("trp_access");
  jar.delete("trp_refresh");
}

export interface Account {
  id: string;
  display_name: string;
  role: string;
}

export async function requireAccount(
  req: Request,
  moderator = false,
): Promise<Account> {
  if (req.method !== "GET") sameOrigin(req);
  const jar = await cookies();
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  let token = bearer || jar.get("trp_access")?.value;
  const refresh = !bearer && jar.get("trp_refresh")?.value;
  if (!token && !refresh)
    throw new RequestError(
      "Sign in with your verified email to contribute.",
      401,
    );
  let user;
  try {
    if (token) user = await authRequest("user", undefined, token);
  } catch (error) {
    if (!(error instanceof RequestError) || error.status !== 401 || !refresh)
      throw error;
  }
  if (!user && refresh) {
    const session = await authRequest("token?grant_type=refresh_token", {
      refresh_token: refresh,
    });
    await setSession(session);
    token = session.access_token;
    user = await authRequest("user", undefined, token);
  }
  if (
    !user?.id ||
    !user.email ||
    !user.email_confirmed_at ||
    user.is_anonymous
  ) {
    throw new RequestError("Verify your email before contributing.", 401);
  }
  const name =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim().slice(0, 60)
      : "";
  const profile = await query<Account>(
    `
    INSERT INTO users (id, display_name, email_private, role, is_anonymous_public)
    VALUES ($1, $2, $3, 'citizen', FALSE)
    ON CONFLICT (id) DO UPDATE SET email_private = EXCLUDED.email_private
    WHERE users.deleted_at IS NULL
    RETURNING id, COALESCE(display_name, 'Community contributor') AS display_name, role
  `,
    [user.id, name || "Community contributor", user.email],
  );
  const account = profile.rows[0];
  if (!account) throw new RequestError("This account is unavailable.", 403);
  // Roles come from the trusted database, never editable Auth user metadata or request bodies.
  if (moderator && !["moderator", "admin"].includes(account.role))
    throw new RequestError("Moderator access required.", 403);
  return account;
}
