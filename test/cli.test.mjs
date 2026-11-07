import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { test } from "node:test";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function cleanEnvironment(overrides = {}) {
  const environment = { ...process.env, ...overrides };
  delete environment.APPLYGUY_API_KEY;
  delete environment.APPLYGUY_API_KEY_FILE;
  delete environment.APPLYGUY_ACCESS_TOKEN;
  delete environment.APPLYGUY_ACCESS_TOKEN_FILE;
  delete environment.APPLYGUY_REFRESH_TOKEN;
  delete environment.APPLYGUY_REFRESH_TOKEN_FILE;
  return { ...environment, ...overrides };
}

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: cleanEnvironment(options.env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.stdin.end(options.input);
  });
}

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    return await callback("http://127.0.0.1:" + address.port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("prints help and package version", async () => {
  const help = await runCli(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /JSON-first job search/);
  assert.equal(help.stderr, "");

  const version = await runCli(["--version"]);
  assert.equal(version.code, 0);
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(version.stdout.trim(), manifest.version);
});

test("keeps secrets out of command-line options", async () => {
  const result = await runCli(["jobs", "search", "--api-key", "secret"]);
  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  const body = JSON.parse(result.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "invalid_cli_input");
  assert.equal(result.stderr.includes("secret"), false);
});

test("returns a structured config error when the API key is missing", async () => {
  const result = await runCli(["jobs", "search", "--q", "engineer"]);
  assert.equal(result.code, 3);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).error.code, "api_key_required");
});

test("searches jobs with JSON output and metering metadata", async () => {
  await withServer((request, response) => {
    assert.equal(request.url, "/v1/jobs?q=software+engineer&limit=1");
    assert.equal(request.headers.authorization, "Bearer test_key");
    response.writeHead(200, {
      "content-type": "application/json",
      "x-applyguy-credit-cost": "0.05",
      "x-applyguy-credit-balance": "9.95",
      "x-applyguy-credit-cost-milli": "50",
      "x-applyguy-credit-balance-milli": "9950",
    });
    response.end(JSON.stringify({ data: [], nextCursor: null }));
  }, async (origin) => {
    const result = await runCli([
      "jobs",
      "search",
      "--q",
      "software engineer",
      "--limit",
      "1",
      "--base-url",
      origin,
    ], { env: { APPLYGUY_API_KEY: "test_key" } });

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, true);
    assert.deepEqual(body.data, []);
    assert.equal(body.meta.nextCursor, null);
    assert.deepEqual(body.meta.creditUsage, {
      cost: 0.05,
      balance: 9.95,
      costMilli: 50,
      balanceMilli: 9950,
    });
  });
});

test("maps API errors to stable JSON and shell exit codes", async () => {
  await withServer((_request, response) => {
    response.writeHead(429, {
      "content-type": "application/json",
      "retry-after": "7",
    });
    response.end(JSON.stringify({
      error: {
        code: "rate_limited",
        message: "Slow down.",
        requestId: "req_cli_test",
      },
    }));
  }, async (origin) => {
    const result = await runCli([
      "credits",
      "balance",
      "--base-url",
      origin,
    ], { env: { APPLYGUY_API_KEY: "test_key" } });

    assert.equal(result.code, 7);
    assert.equal(result.stdout, "");
    const body = JSON.parse(result.stderr);
    assert.deepEqual(body, {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Slow down.",
        status: 429,
        requestId: "req_cli_test",
        retryAfterSeconds: 7,
      },
    });
  });
});

test("wait stops when an agent answer is required", async () => {
  let polls = 0;
  await withServer((_request, response) => {
    polls += 1;
    const status = polls === 1 ? "queued" : "awaiting_answers";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      data: {
        id: "app_test",
        jobUrl: "https://example.test/job",
        ats: "greenhouse",
        company: "Example",
        jobTitle: "Engineer",
        mode: "agent",
        status,
        error: null,
        outcomeCode: null,
        outcomeDetails: null,
        failureCode: null,
        answerRound: status === "awaiting_answers" ? 1 : 0,
        requiresAnswers: status === "awaiting_answers",
        answerRequest: null,
        queuedAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        submittedAnswers: null,
      },
    }));
  }, async (origin) => {
    const result = await runCli([
      "applications",
      "wait",
      "app_test",
      "--interval-ms",
      "250",
      "--timeout-ms",
      "2000",
      "--base-url",
      origin,
    ], { env: { APPLYGUY_API_KEY: "test_key" } });

    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).data.status, "awaiting_answers");
    assert.equal(polls, 2);
  });
});
