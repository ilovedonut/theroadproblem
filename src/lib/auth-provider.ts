import { RequestError } from "./evidence-validation.ts";

// Supabase Auth's REST API keeps tokens server-side; no application signing key or service-role key is used.
export function authConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new RequestError(
      "Email sign-in is not configured yet. Your draft can still be saved on this device.",
      503,
    );
  return { url: url.replace(/\/$/, ""), key };
}

export async function authRequest(
  path: string,
  body?: unknown,
  token?: string,
) {
  const { url, key } = authConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new RequestError(
      "Email sign-in is temporarily unavailable. Please try again.",
      503,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new RequestError(
      response.status === 429
        ? "Please wait before requesting or trying another code."
        : path.startsWith("verify")
          ? "That code is invalid or has expired. Request a new code and try again."
          : path === "user" || path.startsWith("token")
            ? "Please sign in again to continue."
            : "Unable to send a code. Please try again shortly.",
      response.status === 429 ? 429 : 401,
    );
  }
  return data;
}
