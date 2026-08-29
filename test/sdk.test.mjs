import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { ApplyGuy, ApplyGuyApiError } from "../dist/index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("keeps credentials out of enumerable client state", () => {
  const client = new ApplyGuy({
    apiKey: "ag_live_secret",
    accessToken: "access_secret",
    baseUrl: "https://example.test",
  });

  const serialized = JSON.stringify(client);
  assert.equal(serialized.includes("ag_live_secret"), false);
  assert.equal(serialized.includes("access_secret"), false);
  assert.deepEqual(Object.keys(client), [
    "jobs",
    "profile",
    "credits",
    "applications",
    "webhooks",
    "usage",
    "apiKeys",
    "integrations",
  ]);
});

test("preserves structured API errors and request IDs", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      code: "profile_incomplete",
      message: "Complete the required candidate profile fields.",
      details: { missing: ["phone"] },
      requestId: "req_test",
    },
  }), {
    status: 422,
    headers: { "content-type": "application/json", "retry-after": "17" },
  });

  const client = new ApplyGuy({ apiKey: "ag_live_test", baseUrl: "https://example.test" });
  await assert.rejects(
    client.applications.preflight({ jobId: crypto.randomUUID() }),
    (error) => {
      assert.ok(error instanceof ApplyGuyApiError);
      assert.equal(error.status, 422);
      assert.equal(error.code, "profile_incomplete");
      assert.equal(error.requestId, "req_test");
      assert.equal(error.retryAfterSeconds, 17);
      assert.deepEqual(error.details, { missing: ["phone"] });
      return true;
    },
  );
});

test("authenticates requests and exposes exact job-search metering", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://example.test/v1/jobs?q=software+engineer&limit=25");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer ag_live_test");
    return new Response(JSON.stringify({ data: [], nextCursor: null }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "X-ApplyGuy-Credit-Cost": "0.05",
        "X-ApplyGuy-Credit-Balance": "12.295",
        "X-ApplyGuy-Credit-Cost-Milli": "50",
        "X-ApplyGuy-Credit-Balance-Milli": "12295",
      },
    });
  };

  const client = new ApplyGuy({ apiKey: "ag_live_test", baseUrl: "https://example.test" });
  const result = await client.jobs.search({ q: "software engineer", limit: 25 });
  assert.deepEqual(result.data, []);
  assert.deepEqual(result.creditUsage, {
    cost: 0.05,
    balance: 12.295,
    costMilli: 50,
    balanceMilli: 12_295,
  });
});

test("uses the bootstrap access token for API-key management", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer access_test");
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const client = new ApplyGuy({
    apiKey: "ag_live_test",
    accessToken: "access_test",
    baseUrl: "https://example.test",
  });
  const result = await client.apiKeys.list();
  assert.deepEqual(result.data, []);
});

test("refuses to send credentials to an insecure remote base URL", () => {
  assert.throws(
    () => new ApplyGuy({ apiKey: "ag_live_test", baseUrl: "http://api.example.test" }),
    /must use HTTPS/,
  );
  assert.doesNotThrow(
    () => new ApplyGuy({ apiKey: "ag_live_test", baseUrl: "http://localhost:3000" }),
  );
});
