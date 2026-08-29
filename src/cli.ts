#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  ApplyGuy,
  ApplyGuyApiError,
  type Application,
  type ApplicationInput,
  type ApplicationMode,
  type ApplicationStatus,
  type CandidateContext,
  type CreateUsageShareLinkInput,
  type DeveloperScope,
  type UsageRange,
  type WebhookEvent,
} from "./index.js";

type JsonRecord = Record<string, unknown>;
type ParsedArgs = {
  positionals: string[];
  flags: Map<string, string | true>;
};

const HELP = [
  "Apply Guy CLI — JSON-first job search and application automation",
  "",
  "Usage:",
  "  applyguy <command> [options]",
  "",
  "Discovery and setup:",
  "  openapi",
  "  bootstrap --input <file|->",
  "  auth refresh",
  "  keys list|create|revoke",
  "  integrations status|connect-gmail",
  "",
  "Jobs and profile:",
  "  jobs search [--q text] [--ats name] [--remote remote|hybrid|onsite] [--limit n] [--cursor n]",
  "  jobs get <job-id>",
  "  profile get",
  "  profile update --input <file|->",
  "  profile resume upload <path|-> [--filename name]",
  "",
  "Applications:",
  "  applications preflight (--job-id id | --job-url url) [--mode managed|agent]",
  "  applications create (--job-id id | --job-url url) --idempotency-key key [--mode managed|agent] [--wait]",
  "  applications list",
  "  applications get|wait|answer-request|cancel <application-id>",
  "  applications answer <application-id> --input <file|->",
  "",
  "Credits, usage, and webhooks:",
  "  credits balance",
  "  credits checkout --amount-cents n",
  "  credits checkout-status <session-id>",
  "  usage get [--range 24h|7d|30d|90d]",
  "  usage links list|create|revoke|exchange",
  "  webhooks list|create|update|delete",
  "",
  "Global options:",
  "  --base-url url      Override APPLYGUY_BASE_URL",
  "  --pretty            Indent JSON output",
  "  --help              Show this help",
  "  --version           Show the package version",
  "",
  "Authentication:",
  "  APPLYGUY_API_KEY or APPLYGUY_API_KEY_FILE",
  "  APPLYGUY_ACCESS_TOKEN or APPLYGUY_ACCESS_TOKEN_FILE",
  "  APPLYGUY_REFRESH_TOKEN or APPLYGUY_REFRESH_TOKEN_FILE",
  "",
  "Output:",
  "  Success is one JSON document on stdout. Errors are one JSON document on stderr.",
  "  The CLI never prompts, colors output, or accepts secrets as command arguments.",
].join("\n");

const BOOLEAN_FLAGS = new Set([
  "help",
  "pretty",
  "version",
  "wait",
  "require-success",
]);

const GLOBAL_FLAGS = new Set([
  "base-url",
  "help",
  "pretty",
  "version",
]);

class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CliError";
  }
}

function usage(message: string, details?: unknown): never {
  throw new CliError("invalid_cli_input", message, 2, details);
}

function parseArguments(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (argument === "-h") {
      flags.set("help", true);
      continue;
    }
    if (argument === "-V") {
      flags.set("version", true);
      continue;
    }
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }

    const raw = argument.slice(2);
    const separator = raw.indexOf("=");
    const name = separator >= 0 ? raw.slice(0, separator) : raw;
    if (!/^[a-z][a-z0-9-]*$/.test(name)) usage("Invalid option name: " + argument);
    if (flags.has(name)) usage("Option may be provided only once: --" + name);

    if (BOOLEAN_FLAGS.has(name)) {
      if (separator >= 0) usage("Boolean option does not accept a value: --" + name);
      flags.set(name, true);
      continue;
    }

    const attached = separator >= 0 ? raw.slice(separator + 1) : undefined;
    const next = attached ?? args[index + 1];
    if (next === undefined || (attached === undefined && next.startsWith("--"))) {
      usage("Missing value for --" + name);
    }
    if (attached === undefined) index += 1;
    flags.set(name, next);
  }

  return { positionals, flags };
}

function assertFlags(parsed: ParsedArgs, allowed: string[]): void {
  const accepted = new Set([...GLOBAL_FLAGS, ...allowed]);
  for (const name of parsed.flags.keys()) {
    if (!accepted.has(name)) usage("Unknown option for this command: --" + name);
  }
}

function assertPositionals(parsed: ParsedArgs, count: number, usageText: string): void {
  if (parsed.positionals.length !== count) usage("Usage: applyguy " + usageText);
}

function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags.get(name);
  if (value === undefined) return undefined;
  if (value === true) usage("--" + name + " requires a value");
  return value;
}

function requiredFlag(parsed: ParsedArgs, name: string): string {
  const value = stringFlag(parsed, name)?.trim();
  if (!value) usage("--" + name + " is required");
  return value;
}

function numberFlag(
  parsed: ParsedArgs,
  name: string,
  fallback: number | undefined,
  minimum: number,
  maximum: number,
): number | undefined {
  const raw = stringFlag(parsed, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    usage("--" + name + " must be an integer from " + minimum + " through " + maximum);
  }
  return value;
}

function enumFlag<T extends string>(
  parsed: ParsedArgs,
  name: string,
  values: readonly T[],
  fallback?: T,
): T | undefined {
  const raw = stringFlag(parsed, name);
  if (raw === undefined) return fallback;
  if (!values.includes(raw as T)) {
    usage("--" + name + " must be one of: " + values.join(", "));
  }
  return raw as T;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readStdin(limitBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      throw new CliError("input_too_large", "Standard input exceeded the local size limit.", 2, { limitBytes });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readBytes(path: string, limitBytes: number): Promise<Buffer> {
  try {
    const value = path === "-" ? await readStdin(limitBytes) : await readFile(path);
    if (value.length > limitBytes) {
      throw new CliError("input_too_large", "Input file exceeded the local size limit.", 2, { limitBytes });
    }
    return value;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("input_read_failed", "Could not read input: " + path, 2);
  }
}

async function readJsonInput(parsed: ParsedArgs, required = true): Promise<JsonRecord> {
  const path = stringFlag(parsed, "input");
  if (!path) {
    if (!required) return {};
    usage("--input <file|-> is required");
  }
  const bytes = await readBytes(path, 1_048_576);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new CliError("invalid_json", "Input is not valid JSON.", 2);
  }
  if (!isRecord(value)) {
    throw new CliError("invalid_json", "Input JSON must be an object.", 2);
  }
  return value;
}

async function secretFromEnvironment(valueName: string, fileName: string): Promise<string | undefined> {
  const direct = process.env[valueName]?.trim();
  if (direct) return direct;
  const path = process.env[fileName]?.trim();
  if (!path) return undefined;
  try {
    const value = (await readFile(path, "utf8")).trim();
    return value || undefined;
  } catch {
    throw new CliError("secret_file_unreadable", "Could not read " + fileName + ".", 3);
  }
}

function baseUrl(parsed: ParsedArgs): string | undefined {
  return stringFlag(parsed, "base-url") ?? process.env.APPLYGUY_BASE_URL?.trim() ?? undefined;
}

async function createClient(
  parsed: ParsedArgs,
  requirements: { apiKey?: boolean; accessToken?: boolean } = { apiKey: true },
): Promise<ApplyGuy> {
  const apiKey = await secretFromEnvironment("APPLYGUY_API_KEY", "APPLYGUY_API_KEY_FILE");
  const accessToken = await secretFromEnvironment("APPLYGUY_ACCESS_TOKEN", "APPLYGUY_ACCESS_TOKEN_FILE");
  if (requirements.apiKey && !apiKey) {
    throw new CliError(
      "api_key_required",
      "Set APPLYGUY_API_KEY or APPLYGUY_API_KEY_FILE.",
      3,
    );
  }
  if (requirements.accessToken && !accessToken) {
    throw new CliError(
      "access_token_required",
      "Set APPLYGUY_ACCESS_TOKEN or APPLYGUY_ACCESS_TOKEN_FILE.",
      3,
    );
  }
  try {
    return new ApplyGuy({
      apiKey: apiKey ?? "unused",
      accessToken,
      baseUrl: baseUrl(parsed),
    });
  } catch (error) {
    throw new CliError(
      "invalid_base_url",
      error instanceof Error ? error.message : "The API base URL is invalid.",
      2,
    );
  }
}

function applicationInput(parsed: ParsedArgs): ApplicationInput {
  const jobId = stringFlag(parsed, "job-id")?.trim();
  const jobUrl = stringFlag(parsed, "job-url")?.trim();
  if (Boolean(jobId) === Boolean(jobUrl)) {
    usage("Provide exactly one of --job-id or --job-url.");
  }
  const mode = enumFlag<ApplicationMode>(parsed, "mode", ["managed", "agent"], "managed")!;
  const ats = stringFlag(parsed, "ats")?.trim() || undefined;
  return jobId
    ? { jobId, mode, ...(ats ? { ats } : {}) }
    : { jobUrl: jobUrl!, mode, ...(ats ? { ats } : {}) };
}

function successEnvelope(value: unknown): JsonRecord {
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "data")) {
    const { data, ...metadata } = value;
    return Object.keys(metadata).length > 0
      ? { ok: true, data, meta: metadata }
      : { ok: true, data };
  }
  return { ok: true, data: value ?? null };
}

function writeJson(stream: NodeJS.WriteStream, value: unknown, pretty: boolean): void {
  stream.write(JSON.stringify(value, null, pretty ? 2 : 0) + "\n");
}

function apiExitCode(status: number): number {
  if (status === 401 || status === 403) return 3;
  if (status === 404) return 4;
  if (status === 409) return 5;
  if (status === 402) return 6;
  if (status === 429) return 7;
  if (status >= 500) return 8;
  if (status === 400 || status === 413 || status === 422) return 2;
  return 10;
}

function handleFailure(error: unknown, pretty: boolean): never {
  if (error instanceof ApplyGuyApiError) {
    writeJson(process.stderr, {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        status: error.status,
        requestId: error.requestId,
        retryAfterSeconds: error.retryAfterSeconds,
        details: error.details,
      },
    }, pretty);
    process.exit(apiExitCode(error.status));
  }
  if (error instanceof CliError) {
    writeJson(process.stderr, {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    }, pretty);
    process.exit(error.exitCode);
  }
  const isNetworkError = error instanceof TypeError
    && (error.message.includes("fetch") || error.message.includes("network"));
  writeJson(process.stderr, {
    ok: false,
    error: {
      code: isNetworkError ? "network_error" : "cli_internal_error",
      message: error instanceof Error ? error.message : "Unexpected CLI failure.",
      ...(process.env.APPLYGUY_DEBUG === "1" && error instanceof Error
        ? { stack: error.stack }
        : {}),
    },
  }, pretty);
  process.exit(isNetworkError ? 8 : 10);
}

async function fetchOpenApi(parsed: ParsedArgs): Promise<unknown> {
  const rawBase = baseUrl(parsed) ?? "https://api.applyguy.ai";
  let url: URL;
  try {
    url = new URL("/v1/openapi.json", rawBase);
  } catch {
    throw new CliError("invalid_base_url", "The API base URL is invalid.", 2);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new CliError(
      "openapi_unavailable",
      "OpenAPI request failed with HTTP " + response.status + ".",
      response.status >= 500 ? 8 : 10,
    );
  }
  return response.json();
}

async function waitForApplication(
  client: ApplyGuy,
  id: string,
  parsed: ParsedArgs,
): Promise<{ data: Application }> {
  const timeoutMs = numberFlag(parsed, "timeout-ms", 600_000, 1_000, 3_600_000)!;
  const initialIntervalMs = numberFlag(parsed, "interval-ms", 1_000, 250, 60_000)!;
  const requested = stringFlag(parsed, "until") ?? "awaiting_answers,success,failed,cancelled";
  const validStatuses: ApplicationStatus[] = [
    "queued",
    "running",
    "awaiting_answers",
    "success",
    "failed",
    "cancelled",
  ];
  const until = new Set(requested.split(",").map((value) => value.trim()).filter(Boolean));
  if (until.size === 0 || [...until].some((status) => !validStatuses.includes(status as ApplicationStatus))) {
    usage("--until must be a comma-separated list of application statuses.");
  }

  const startedAt = Date.now();
  let intervalMs = initialIntervalMs;
  let lastStatus: ApplicationStatus | undefined;
  let lastApplication: Application | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await client.applications.get(id);
      lastApplication = result.data;
      if (lastApplication.status !== lastStatus) {
        lastStatus = lastApplication.status;
        intervalMs = initialIntervalMs;
      }
      if (until.has(lastApplication.status)) {
        if (parsed.flags.has("require-success") && lastApplication.status !== "success") {
          throw new CliError(
            "application_not_successful",
            "Application reached status " + lastApplication.status + ".",
            5,
            { application: lastApplication },
          );
        }
        return result;
      }
    } catch (error) {
      if (!(error instanceof ApplyGuyApiError) || error.status !== 429) throw error;
      intervalMs = Math.max(intervalMs, (error.retryAfterSeconds ?? 1) * 1_000);
    }

    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    await delay(Math.min(intervalMs, remaining));
    intervalMs = Math.min(10_000, Math.ceil(intervalMs * 1.6));
  }

  throw new CliError(
    "wait_timeout",
    "Timed out waiting for the application. The remote application was not cancelled.",
    9,
    { application: lastApplication ?? null },
  );
}

async function dispatch(parsed: ParsedArgs): Promise<unknown> {
  const [group, action, subject] = parsed.positionals;

  if (group === "openapi") {
    assertPositionals(parsed, 1, "openapi");
    assertFlags(parsed, []);
    return fetchOpenApi(parsed);
  }

  if (group === "bootstrap") {
    assertPositionals(parsed, 1, "bootstrap --input <file|->");
    assertFlags(parsed, ["input"]);
    const input = await readJsonInput(parsed);
    return ApplyGuy.bootstrap(input as Parameters<typeof ApplyGuy.bootstrap>[0], {
      baseUrl: baseUrl(parsed),
    });
  }

  if (group === "auth" && action === "refresh") {
    assertPositionals(parsed, 2, "auth refresh");
    assertFlags(parsed, []);
    const token = await secretFromEnvironment(
      "APPLYGUY_REFRESH_TOKEN",
      "APPLYGUY_REFRESH_TOKEN_FILE",
    );
    if (!token) {
      throw new CliError(
        "refresh_token_required",
        "Set APPLYGUY_REFRESH_TOKEN or APPLYGUY_REFRESH_TOKEN_FILE.",
        3,
      );
    }
    return ApplyGuy.refresh(token, { baseUrl: baseUrl(parsed) });
  }

  if (group === "jobs" && action === "search") {
    assertPositionals(parsed, 2, "jobs search [options]");
    assertFlags(parsed, ["q", "ats", "country", "remote", "limit", "cursor"]);
    const client = await createClient(parsed);
    const country = enumFlag(parsed, "country", ["US"] as const);
    const remote = enumFlag(parsed, "remote", ["remote", "hybrid", "onsite"] as const);
    const limit = numberFlag(parsed, "limit", undefined, 1, 100);
    const cursor = numberFlag(parsed, "cursor", undefined, 0, 10_000);
    return client.jobs.search({
      ...(stringFlag(parsed, "q") ? { q: stringFlag(parsed, "q") } : {}),
      ...(stringFlag(parsed, "ats") ? { ats: stringFlag(parsed, "ats") } : {}),
      ...(country ? { country } : {}),
      ...(remote ? { remote } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });
  }

  if (group === "jobs" && action === "get") {
    assertPositionals(parsed, 3, "jobs get <job-id>");
    assertFlags(parsed, []);
    return (await createClient(parsed)).jobs.get(subject!);
  }

  if (group === "profile" && action === "get") {
    assertPositionals(parsed, 2, "profile get");
    assertFlags(parsed, []);
    return (await createClient(parsed)).profile.get();
  }

  if (group === "profile" && action === "update") {
    assertPositionals(parsed, 2, "profile update --input <file|->");
    assertFlags(parsed, ["input"]);
    const input = await readJsonInput(parsed);
    return (await createClient(parsed)).profile.update(input as CandidateContext);
  }

  if (group === "profile" && action === "resume" && subject === "upload") {
    assertPositionals(parsed, 4, "profile resume upload <path|-> [--filename name]");
    assertFlags(parsed, ["filename"]);
    const path = parsed.positionals[3]!;
    const filename = stringFlag(parsed, "filename")
      ?? (path === "-" ? undefined : basename(path));
    if (!filename) usage("--filename is required when uploading a resume from stdin.");
    const bytes = await readBytes(path, 25 * 1_048_576);
    const copy = new Uint8Array(new ArrayBuffer(bytes.length));
    copy.set(bytes);
    return (await createClient(parsed)).profile.uploadResume(new Blob([copy.buffer]), filename);
  }

  if (group === "credits" && action === "balance") {
    assertPositionals(parsed, 2, "credits balance");
    assertFlags(parsed, []);
    return (await createClient(parsed)).credits.get();
  }

  if (group === "credits" && action === "checkout") {
    assertPositionals(parsed, 2, "credits checkout --amount-cents n");
    assertFlags(parsed, ["amount-cents"]);
    const amount = numberFlag(parsed, "amount-cents", undefined, 1, 10_000_000);
    if (amount === undefined) usage("--amount-cents is required.");
    return (await createClient(parsed)).credits.checkout(amount);
  }

  if (group === "credits" && action === "checkout-status") {
    assertPositionals(parsed, 3, "credits checkout-status <session-id>");
    assertFlags(parsed, []);
    return (await createClient(parsed)).credits.checkoutStatus(subject!);
  }

  if (group === "applications" && action === "preflight") {
    assertPositionals(parsed, 2, "applications preflight (--job-id id | --job-url url)");
    assertFlags(parsed, ["job-id", "job-url", "ats", "mode"]);
    const input = applicationInput(parsed);
    return (await createClient(parsed)).applications.preflight(input);
  }

  if (group === "applications" && action === "create") {
    assertPositionals(parsed, 2, "applications create (--job-id id | --job-url url) --idempotency-key key");
    assertFlags(parsed, [
      "job-id",
      "job-url",
      "ats",
      "mode",
      "idempotency-key",
      "wait",
      "until",
      "timeout-ms",
      "interval-ms",
      "require-success",
    ]);
    const input = applicationInput(parsed);
    const key = requiredFlag(parsed, "idempotency-key");
    if (key.length > 200) usage("--idempotency-key must be at most 200 characters.");
    const client = await createClient(parsed);
    const created = await client.applications.create(input, key);
    return parsed.flags.has("wait")
      ? waitForApplication(client, created.data.id, parsed)
      : created;
  }

  if (group === "applications" && action === "list") {
    assertPositionals(parsed, 2, "applications list");
    assertFlags(parsed, []);
    return (await createClient(parsed)).applications.list();
  }

  if (group === "applications" && action === "get") {
    assertPositionals(parsed, 3, "applications get <application-id>");
    assertFlags(parsed, []);
    return (await createClient(parsed)).applications.get(subject!);
  }

  if (group === "applications" && action === "wait") {
    assertPositionals(parsed, 3, "applications wait <application-id>");
    assertFlags(parsed, ["until", "timeout-ms", "interval-ms", "require-success"]);
    return waitForApplication(await createClient(parsed), subject!, parsed);
  }

  if (group === "applications" && action === "answer-request") {
    assertPositionals(parsed, 3, "applications answer-request <application-id>");
    assertFlags(parsed, []);
    return (await createClient(parsed)).applications.answerRequest(subject!);
  }

  if (group === "applications" && action === "answer") {
    assertPositionals(parsed, 3, "applications answer <application-id> --input <file|->");
    assertFlags(parsed, ["input"]);
    const input = await readJsonInput(parsed);
    const requestId = typeof input.requestId === "string" ? input.requestId : undefined;
    const fingerprint = typeof input.fingerprint === "string" ? input.fingerprint : undefined;
    if (!requestId || !fingerprint || !Object.prototype.hasOwnProperty.call(input, "answer")) {
      usage("Answer input requires requestId, fingerprint, and answer.");
    }
    return (await createClient(parsed)).applications.answer(subject!, {
      requestId,
      fingerprint,
      answer: input.answer,
    });
  }

  if (group === "applications" && action === "cancel") {
    assertPositionals(parsed, 3, "applications cancel <application-id>");
    assertFlags(parsed, []);
    return (await createClient(parsed)).applications.cancel(subject!);
  }

  if (group === "usage" && action === "get") {
    assertPositionals(parsed, 2, "usage get [--range 24h|7d|30d|90d]");
    assertFlags(parsed, ["range"]);
    const range = enumFlag<UsageRange>(parsed, "range", ["24h", "7d", "30d", "90d"], "30d")!;
    return (await createClient(parsed)).usage.get(range);
  }

  if (group === "usage" && action === "links" && subject === "list") {
    assertPositionals(parsed, 3, "usage links list");
    assertFlags(parsed, []);
    return (await createClient(parsed)).usage.shareLinks.list();
  }

  if (group === "usage" && action === "links" && subject === "create") {
    assertPositionals(parsed, 3, "usage links create [--input <file|->]");
    assertFlags(parsed, ["input"]);
    const input = await readJsonInput(parsed, false);
    return (await createClient(parsed)).usage.shareLinks.create(input as CreateUsageShareLinkInput);
  }

  if (group === "usage" && action === "links" && subject === "revoke") {
    assertPositionals(parsed, 4, "usage links revoke <link-id>");
    assertFlags(parsed, []);
    return (await createClient(parsed)).usage.shareLinks.revoke(parsed.positionals[3]!);
  }

  if (group === "usage" && action === "links" && subject === "exchange") {
    assertPositionals(parsed, 3, "usage links exchange --input <file|->");
    assertFlags(parsed, ["input"]);
    const input = await readJsonInput(parsed);
    if (typeof input.token !== "string" || !input.token) usage("Exchange input requires token.");
    return ApplyGuy.exchangeUsageShareLink(input.token, { baseUrl: baseUrl(parsed) });
  }

  if (group === "webhooks" && action === "list") {
    assertPositionals(parsed, 2, "webhooks list");
    assertFlags(parsed, []);
    return (await createClient(parsed)).webhooks.list();
  }

  if (group === "webhooks" && action === "create") {
    assertPositionals(parsed, 2, "webhooks create --input <file|->");
    assertFlags(parsed, ["input"]);
    const input = await readJsonInput(parsed);
    if (typeof input.url !== "string") usage("Webhook input requires url.");
    return (await createClient(parsed)).webhooks.create({
      url: input.url,
      ...(Array.isArray(input.events) ? { events: input.events as WebhookEvent[] } : {}),
    });
  }

  if (group === "webhooks" && action === "update") {
    assertPositionals(parsed, 3, "webhooks update <webhook-id> --input <file|->");
    assertFlags(parsed, ["input"]);
    const input = await readJsonInput(parsed);
    return (await createClient(parsed)).webhooks.update(subject!, input as {
      url?: string;
      events?: WebhookEvent[];
      active?: boolean;
    });
  }

  if (group === "webhooks" && action === "delete") {
    assertPositionals(parsed, 3, "webhooks delete <webhook-id>");
    assertFlags(parsed, []);
    return (await createClient(parsed)).webhooks.delete(subject!);
  }

  if (group === "keys" && action === "list") {
    assertPositionals(parsed, 2, "keys list");
    assertFlags(parsed, []);
    return (await createClient(parsed, { accessToken: true })).apiKeys.list();
  }

  if (group === "keys" && action === "create") {
    assertPositionals(parsed, 2, "keys create [--input <file|->]");
    assertFlags(parsed, ["input"]);
    const input = await readJsonInput(parsed, false);
    return (await createClient(parsed, { accessToken: true })).apiKeys.create(input as {
      name?: string;
      scopes?: DeveloperScope[];
      expiresAt?: string;
    });
  }

  if (group === "keys" && action === "revoke") {
    assertPositionals(parsed, 3, "keys revoke <key-id>");
    assertFlags(parsed, []);
    return (await createClient(parsed, { accessToken: true })).apiKeys.revoke(subject!);
  }

  if (group === "integrations" && action === "status") {
    assertPositionals(parsed, 2, "integrations status");
    assertFlags(parsed, []);
    return (await createClient(parsed, { accessToken: true })).integrations.status();
  }

  if (group === "integrations" && action === "connect-gmail") {
    assertPositionals(parsed, 2, "integrations connect-gmail --input <file|->");
    assertFlags(parsed, ["input"]);
    const input = await readJsonInput(parsed);
    if (typeof input.gmailUser !== "string" || typeof input.gmailAppPassword !== "string") {
      usage("Gmail input requires gmailUser and gmailAppPassword.");
    }
    return (await createClient(parsed, { accessToken: true })).integrations.connectGmail({
      gmailUser: input.gmailUser,
      gmailAppPassword: input.gmailAppPassword,
    });
  }

  usage("Unknown command. Run applyguy --help.");
}

async function packageVersion(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };
  return typeof manifest.version === "string" ? manifest.version : "unknown";
}

async function run(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  const pretty = parsed.flags.has("pretty");

  if (parsed.flags.has("version")) {
    process.stdout.write(await packageVersion() + "\n");
    return;
  }
  if (parsed.flags.has("help") || parsed.positionals.length === 0) {
    process.stdout.write(HELP + "\n");
    return;
  }

  const result = await dispatch(parsed);
  writeJson(process.stdout, successEnvelope(result), pretty);
}

process.once("SIGINT", () => {
  writeJson(process.stderr, {
    ok: false,
    error: {
      code: "interrupted",
      message: "CLI interrupted. No remote application was cancelled.",
    },
  }, false);
  process.exit(130);
});

run().catch((error) => {
  handleFailure(error, process.argv.slice(2).includes("--pretty"));
});
