import test from "node:test";
import assert from "node:assert/strict";
import { authRequest, authConfig } from "../src/lib/auth-provider.ts";

test("Auth fails closed when project configuration is missing", () => {
  const names = [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];
  const prior = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    for (const n of names) delete process.env[n];
    assert.throws(() => authConfig(), /not configured/);
  } finally {
    for (const n of names) {
      if (prior[n] === undefined) delete process.env[n];
      else process.env[n] = prior[n];
    }
  }
});
test("OTP, code verification, user validation and refresh use the configured provider with no caching", async () => {
  const original = globalThis.fetch,
    oldUrl = process.env.SUPABASE_URL,
    oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://example-project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      access_token: "test-access",
      refresh_token: "test-refresh",
      id: "test-user",
    });
  };
  try {
    await authRequest("otp", { email: "test@invalid.test", create_user: true });
    await authRequest("verify", {
      email: "test@invalid.test",
      token: "123456",
      type: "email",
    });
    await authRequest("user", undefined, "test-access");
    await authRequest("token?grant_type=refresh_token", {
      refresh_token: "test-refresh",
    });
    assert.deepEqual(
      calls.map((c) => c.options.method),
      ["POST", "POST", "GET", "POST"],
    );
    for (const c of calls) {
      assert.equal(c.options.cache, "no-store");
      assert.equal(c.options.headers.apikey, "test-publishable-key");
    }
    assert.equal(calls[2].options.headers.Authorization, "Bearer test-access");
    assert.equal(JSON.parse(calls[1].options.body).type, "email");
    globalThis.fetch = async () =>
      Response.json({ error: "otp_expired" }, { status: 403 });
    await assert.rejects(authRequest("verify", {}), /invalid or has expired/);
    globalThis.fetch = async () =>
      Response.json({ error: "rate_limit" }, { status: 429 });
    await assert.rejects(authRequest("otp", {}), (e) => e.status === 429);
    globalThis.fetch = async () => {
      throw new Error("network");
    };
    await assert.rejects(
      authRequest("user", undefined, "test-access"),
      (e) => e.status === 503,
    );
  } finally {
    globalThis.fetch = original;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
