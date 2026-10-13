import test from "node:test";
import assert from "node:assert/strict";
import {
  coordinates,
  uuid,
  text,
  sameOrigin,
} from "../src/lib/evidence-validation.ts";

test("Coordinates reject missing, non-numeric, non-finite and out-of-range positions", () => {
  for (const [lat, lon] of [
    [undefined, undefined],
    ["12", 77],
    [NaN, 77],
    [12, Infinity],
    [91, 77],
    [12, -181],
  ])
    assert.throws(() => coordinates(lat, lon));
  assert.deepEqual(coordinates(0, 0), { lat: 0, lon: 0 });
  assert.deepEqual(coordinates(-90, 180), { lat: -90, lon: 180 });
});
test("Correction reasons and record IDs have bounded validation", () => {
  assert.throws(() => text("   ", "Reason", 5, 2000));
  assert.throws(() => text("x".repeat(2001), "Reason", 5, 2000));
  assert.equal(text("  Opposite lane  ", "Reason", 5, 2000), "Opposite lane");
  assert.throws(() => uuid("not-an-issue"));
  assert.equal(
    uuid("a1111111-aaaa-4aaa-8aaa-111111111111"),
    "a1111111-aaaa-4aaa-8aaa-111111111111",
  );
});
test("Cookie writes reject cross-origin browser requests", () => {
  assert.throws(() =>
    sameOrigin(
      new Request("https://theroadproblem.quest/api", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  );
  assert.throws(() =>
    sameOrigin(
      new Request("https://theroadproblem.quest/api", {
        headers: { "sec-fetch-site": "cross-site" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    sameOrigin(
      new Request("https://theroadproblem.quest/api", {
        headers: { origin: "https://theroadproblem.quest" },
      }),
    ),
  );
});
