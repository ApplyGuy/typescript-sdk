export type ApplicationMode = "managed" | "agent";
export type ApplicationStatus = "queued" | "running" | "awaiting_answers" | "success" | "failed" | "cancelled";
export type DeveloperScope =
  | "jobs:read"
  | "credits:spend"
  | "profile:read"
  | "profile:write"
  | "applications:read"
  | "applications:write"
  | "credits:read"
  | "credits:write"
  | "webhooks:write"
  | "usage:read"
  | "usage:share";
export type WebhookEvent =
  | "application.queued"
  | "application.running"
  | "application.awaiting_answers"
  | "application.succeeded"
  | "application.failed"
  | "application.cancelled";

export interface CandidateAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  county?: string;
}

export interface WorkHistoryEntry {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  location?: string;
  summary?: string;
  highlights?: string[];
}

export interface EducationEntry {
  school: string;
  city: string;
  state: string;
  degree?: string;
  discipline?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

export interface WorkAuthorization {
  country: string;
  status: "citizen" | "permanent-resident" | "work-visa" | "requires-sponsorship" | "student-visa" | "other";
  requiresSponsorship: boolean;
}

export interface LegalDeclarations {
  hasActiveNonCompete?: boolean;
  legalWorkCountries?: string[];
}

export interface WorkPreferences {
  remotePreference?: "remote" | "hybrid" | "onsite" | "flexible";
  willingToRelocate?: boolean;
  willingToCommuteDaysPerWeek?: number;
  salaryRangeUsd?: { min: number; max: number };
  notes?: string;
}

export interface Demographics {
  defaultDisclosure?: "share" | "decline";
  gender?: string;
  ethnicity?: string;
  hispanicOrLatino?: boolean;
  veteranStatus?: "veteran" | "not-veteran" | "prefer-not-to-say";
  militaryStatus?: "none" | "active-duty" | "reserve" | "national-guard" | "veteran" | "prefer-not-to-say";
  disabilityStatus?: "yes" | "no" | "prefer-not-to-say";
  transgender?: boolean;
  lgbtq?: boolean;
}

export interface CandidateContext {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  location?: string;
  address?: CandidateAddress | null;
  linkedin?: string;
  website?: string;
  github?: string;
  portfolio?: string;
  resumeText?: string;
  workHistory?: WorkHistoryEntry[];
  education?: EducationEntry[];
  skills?: string[];
  yearsOfExperience?: Record<string, number>;
  bio?: string;
  motivations?: string;
  discoverySource?: string;
  workAuthorization?: WorkAuthorization;
  legalDeclarations?: LegalDeclarations;
  workPreferences?: WorkPreferences;
  demographics?: Demographics;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  companySlug?: string | null;
  ats: string;
  url: string;
  location: string | null;
  city: string | null;
  state: string | null;
  country: "US";
  remoteType: "remote" | "hybrid" | "onsite" | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: string | null;
  firstSeenAt?: string | null;
  descriptionHtml?: string | null;
  descriptionSections?: Record<string, unknown> | unknown[] | null;
  canonicalTitle?: string | null;
  roleFamily?: string | null;
  specialties?: string[] | null;
  skills?: string[] | null;
  requiredSkills?: string[] | null;
  minimumExperienceYears?: number | null;
  maximumExperienceYears?: number | null;
  educationLevel?: string | null;
  sponsorship?: string | null;
  clearanceRequired?: boolean | null;
  clearanceLabel?: string | null;
  travelPercent?: number | null;
}

export interface JobSearchQuery {
  q?: string;
  ats?: string;
  country?: "US";
  remote?: "remote" | "hybrid" | "onsite";
  limit?: number;
  cursor?: number;
}

interface ApplicationOptions {
  ats?: string;
  mode?: ApplicationMode;
}

export type ApplicationInput = ApplicationOptions & (
  | { jobId: string; jobUrl?: never }
  | { jobId?: never; jobUrl: string }
);

export interface AnswerRequest {
  id: string;
  fingerprint: string;
  responseSchema: Record<string, unknown>;
  prompt: unknown;
  createdAt: string;
}

export interface Application {
  id: string;
  jobUrl: string;
  ats: string | null;
  company: string | null;
  jobTitle: string | null;
  mode: ApplicationMode;
  status: ApplicationStatus;
  error: string | null;
  outcomeCode: string | null;
  outcomeDetails: Record<string, unknown> | null;
  failureCode: string | null;
  answerRound: number;
  requiresAnswers: boolean;
  answerRequest: AnswerRequest | null;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  submittedAnswers: Record<string, unknown> | null;
}

export interface ApplicationPreflight {
  jobUrl: string;
  ats: string | null;
  ready: boolean;
  atsEnabled: boolean;
  modeSupported: boolean;
  emailIntegrationRequired: boolean;
  emailIntegrationConnected: boolean;
  hasResume: boolean;
  hasUploadedResume: boolean;
  missingProfileFields: string[];
  mode: ApplicationMode;
  cost: number;
  formDiscovery: "during_application" | null;
}

export interface CreditBalance {
  balance: number;
  balanceMilli: number;
  costs: {
    managed: number;
    agent: number;
    /** Cost for each requested block of up to 25 job-search results. */
    searchPer25: number;
    /** Cost for a job-detail request that returns 200. */
    jobDetail: number;
  };
  creditsPerDollar: number;
  minimumPurchaseCents: number;
  maximumPurchaseCents: number;
}

export interface CreditUsage {
  /** Decimal credits charged for this successful request. */
  cost: number;
  /** Decimal credit balance after the charge. */
  balance: number;
  /** Exact charge in thousandths of a credit. */
  costMilli: number;
  /** Exact remaining balance in thousandths of a credit. */
  balanceMilli: number;
}

export type MeteredResult<T extends object> = T & {
  /**
   * Parsed from the X-ApplyGuy-Credit-* response headers. Null only when an
   * intermediary or an older API deployment omitted those headers.
   */
  creditUsage: CreditUsage | null;
};

export type UsageRange = "24h" | "7d" | "30d" | "90d";

export interface UsageStatusCounts {
  queued: number;
  running: number;
  awaiting_answers: number;
  success: number;
  failed: number;
  cancelled: number;
}

export interface UsageCreditMetrics {
  purchased: number;
  spent: number;
  refunded: number;
  netUsed: number;
  currentBalance: number;
  purchasedMilli: number;
  spentMilli: number;
  refundedMilli: number;
  netUsedMilli: number;
  currentBalanceMilli: number;
}

export interface UsageTimeSeriesPoint {
  start: string;
  applications: number;
  success: number;
  failed: number;
  creditsSpentMilli: number;
}

export interface UsageAtsBreakdown {
  ats: string;
  applications: number;
  success: number;
  failed: number;
  /** Resolved-outcome success percentage from 0 to 100. */
  successRate: number;
  creditsSpentMilli: number;
}

export interface UsageModeBreakdown {
  mode: string;
  applications: number;
  success: number;
  failed: number;
  /** Resolved-outcome success percentage from 0 to 100. */
  successRate: number;
  creditsSpentMilli: number;
}

export interface UsageApiKeyBreakdown {
  apiKeyId: string;
  name: string;
  prefix: string;
  applications: number;
  success: number;
  failed: number;
  /** Resolved-outcome success percentage from 0 to 100. */
  successRate: number;
  creditsSpentMilli: number;
}

export interface UsageReport {
  range: UsageRange;
  startsAt: string;
  endsAt: string;
  bucket: "hour" | "day";
  summary: {
    applications: number;
    statuses: UsageStatusCounts;
    successful: number;
    /** Percentage from 0 to 100 over terminal success and failed applications. */
    successRate: number;
    credits: UsageCreditMetrics;
    completionMs: { p50: number | null; p95: number | null };
  };
  timeSeries: UsageTimeSeriesPoint[];
  byAts: UsageAtsBreakdown[];
  byMode: UsageModeBreakdown[];
  byApiKey: UsageApiKeyBreakdown[];
  failureReasons: Array<{ reason: string; count: number }>;
}

/** Alias for integrations that describe the usage response as metrics. */
export type UsageMetrics = UsageReport;

export type UsageShareLinkCreator =
  | { type: "api_key"; apiKeyId: string | null; name: string | null; prefix: string | null }
  | { type: "session" };

export interface UsageShareLink {
  id: string;
  range: UsageRange;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  lastViewedAt: string | null;
  viewCount: number;
  creator: UsageShareLinkCreator;
}

export interface CreatedUsageShareLink extends UsageShareLink {
  /** Returned once. The opaque token lives only in this URL's raw fragment. */
  url: string;
}

export interface CreateUsageShareLinkInput {
  range?: UsageRange;
  /** One hour through seven days. Defaults to one day. */
  expiresInSeconds?: number;
}

export interface DeveloperApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: DeveloperScope[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface CreatedDeveloperApiKey extends DeveloperApiKey {
  /** Returned once. Store it securely. */
  key: string;
}

export interface DeveloperWebhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatedDeveloperWebhook extends DeveloperWebhook {
  /** Returned once. Use it to verify X-ApplyGuy-Signature. */
  secret: string;
}

export interface BootstrapResult {
  user: { id: string; email: string; createdAt: string };
  apiKey: Pick<CreatedDeveloperApiKey, "id" | "key" | "prefix" | "scopes">;
  accessToken: string;
  refreshToken: string;
  credits: 0;
  next: { profile: string; resume: string; credits: string };
  warning: string;
}

type RequestAuth = "apiKey" | "accessToken" | "none";

export interface ApplyGuyOptions {
  apiKey: string;
  accessToken?: string;
  baseUrl?: string;
}

export class ApplyGuyApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApplyGuyApiError";
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
}

function baseUrl(value?: string): string {
  const url = new URL(value ?? "https://api.applyguy.ai");
  const isLoopback = url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname === "[::1]";
  if (url.username || url.password) {
    throw new TypeError("Apply Guy baseUrl must not contain credentials.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new TypeError("Apply Guy baseUrl must use HTTPS (HTTP is allowed only for loopback development).");
  }
  return url.toString().replace(/\/$/, "");
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const nested = record.error && typeof record.error === "object"
      ? record.error as Record<string, unknown>
      : null;
    const simpleCode = typeof record.error === "string" ? record.error : null;
    const code = typeof nested?.code === "string" ? nested.code : simpleCode ?? "request_failed";
    const message = typeof nested?.message === "string"
      ? nested.message
      : typeof record.message === "string"
        ? record.message
        : `Apply Guy API request failed (${response.status}).`;
    throw new ApplyGuyApiError(
      response.status,
      code,
      message,
      nested?.details ?? record.details,
      typeof nested?.requestId === "string" ? nested.requestId : response.headers.get("x-request-id") ?? undefined,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }
  return body as T;
}

function parseFiniteHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCreditUsage(headers: Headers): CreditUsage | null {
  const cost = parseFiniteHeader(headers, "x-applyguy-credit-cost");
  const balance = parseFiniteHeader(headers, "x-applyguy-credit-balance");
  const costMilli = parseFiniteHeader(headers, "x-applyguy-credit-cost-milli");
  const balanceMilli = parseFiniteHeader(headers, "x-applyguy-credit-balance-milli");
  if (cost === null || balance === null || costMilli === null || balanceMilli === null) return null;
  return { cost, balance, costMilli, balanceMilli };
}

function json(body: unknown): Pick<RequestInit, "headers" | "body"> {
  return { headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function mimeForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  return "application/pdf";
}

export class ApplyGuy {
  readonly #apiBaseUrl: string;
  readonly #apiKey: string;
  readonly #accessToken?: string;

  constructor(options: ApplyGuyOptions) {
    this.#apiBaseUrl = baseUrl(options.baseUrl);
    this.#apiKey = options.apiKey;
    this.#accessToken = options.accessToken;
  }

  static async bootstrap(
    input: { email: string; password: string; name?: string; scopes?: DeveloperScope[]; expiresAt?: string },
    options: { baseUrl?: string } = {},
  ): Promise<BootstrapResult> {
    const response = await fetch(`${baseUrl(options.baseUrl)}/developer/bootstrap`, {
      method: "POST",
      ...json(input),
    });
    return parseResponse<BootstrapResult>(response);
  }

  static async refresh(refreshToken: string, options: { baseUrl?: string } = {}): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await fetch(`${baseUrl(options.baseUrl)}/auth/refresh`, {
      method: "POST",
      ...json({ refreshToken }),
    });
    return parseResponse(response);
  }

  static async exchangeUsageShareLink(
    token: string,
    options: { baseUrl?: string } = {},
  ): Promise<{ data: UsageReport }> {
    const response = await fetch(`${baseUrl(options.baseUrl)}/v1/usage/share-links/exchange`, {
      method: "POST",
      ...json({ token }),
    });
    return parseResponse(response);
  }

  private async request<T>(path: string, init: RequestInit = {}, auth: RequestAuth = "apiKey"): Promise<T> {
    const headers = new Headers(init.headers);
    if (auth === "apiKey") headers.set("authorization", `Bearer ${this.#apiKey}`);
    if (auth === "accessToken") {
      if (!this.#accessToken) throw new ApplyGuyApiError(401, "access_token_required", "This operation requires the bootstrap access token.");
      headers.set("authorization", `Bearer ${this.#accessToken}`);
    }
    const response = await fetch(`${this.#apiBaseUrl}${path}`, { ...init, headers });
    return parseResponse<T>(response);
  }

  private async meteredRequest<T extends object>(path: string, init: RequestInit = {}): Promise<MeteredResult<T>> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.#apiKey}`);
    const response = await fetch(`${this.#apiBaseUrl}${path}`, { ...init, headers });
    const result = await parseResponse<T>(response);
    return Object.assign(result, { creditUsage: parseCreditUsage(response.headers) });
  }

  jobs = {
    search: (query: JobSearchQuery = {}) => {
      const params = new URLSearchParams(
        Object.entries(query)
          .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
          .map(([key, value]) => [key, String(value)]),
      );
      const suffix = params.size ? `?${params}` : "";
      return this.meteredRequest<{ data: Job[]; nextCursor: string | null }>(`/v1/jobs${suffix}`);
    },
    get: (id: string) => this.meteredRequest<{ data: Job }>(`/v1/jobs/${encodeURIComponent(id)}`),
  };

  profile = {
    get: () => this.request<{ data: { candidateContext: CandidateContext; resumeFilename: string | null; hasResume: boolean } }>("/v1/profile"),
    update: (candidateContext: CandidateContext) => this.request<{ data: { candidateContext: CandidateContext } }>("/v1/profile", {
      method: "PUT",
      ...json({ candidateContext }),
    }),
    uploadResume: (file: Blob, filename = "resume.pdf") => {
      const form = new FormData();
      const typedFile = file.type ? file : new Blob([file], { type: mimeForFilename(filename) });
      form.set("file", typedFile, filename);
      return this.request<{ data: { filename: string } }>("/v1/profile/resume", { method: "PUT", body: form });
    },
  };

  credits = {
    get: () => this.request<{ data: CreditBalance }>("/v1/credits"),
    checkout: (amountCents: number) => this.request<{ data: { checkoutUrl: string; sessionId: string; amountCents: number; credits: number } }>("/v1/credits/checkout", {
      method: "POST",
      ...json({ amountCents }),
    }),
    checkoutStatus: (sessionId: string) => this.request<{ data: { id: string; status: string | null; paymentStatus: string } }>(`/v1/credits/checkout/${encodeURIComponent(sessionId)}`),
  };

  applications = {
    preflight: (input: ApplicationInput) => this.request<{ data: ApplicationPreflight }>("/v1/applications/preflight", { method: "POST", ...json(input) }),
    create: (input: ApplicationInput, idempotencyKey: string) => this.request<{ data: { id: string; status: ApplicationStatus; created: boolean } }>("/v1/applications", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify(input),
    }),
    list: () => this.request<{ data: Application[] }>("/v1/applications"),
    get: (id: string) => this.request<{ data: Application }>(`/v1/applications/${encodeURIComponent(id)}`),
    answerRequest: (id: string) => this.request<{ data: AnswerRequest }>(`/v1/applications/${encodeURIComponent(id)}/answer-request`),
    answer: (id: string, input: { requestId: string; fingerprint: string; answer: unknown }) => this.request<{ data: { id: string; status: "queued" } }>(`/v1/applications/${encodeURIComponent(id)}/answers`, {
      method: "POST",
      ...json(input),
    }),
    cancel: (id: string) => this.request<{ data: { cancelled: true; status: "cancelled"; quotaRefunded: boolean } }>(`/v1/applications/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  };

  webhooks = {
    list: () => this.request<{ data: DeveloperWebhook[] }>("/v1/webhooks"),
    create: (input: { url: string; events?: WebhookEvent[] }) => this.request<{ data: CreatedDeveloperWebhook; warning: string }>("/v1/webhooks", { method: "POST", ...json(input) }),
    update: (id: string, input: { url?: string; events?: WebhookEvent[]; active?: boolean }) => this.request<{ data: DeveloperWebhook }>(`/v1/webhooks/${encodeURIComponent(id)}`, { method: "PATCH", ...json(input) }),
    delete: (id: string) => this.request<void>(`/v1/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };

  usage = {
    get: (range: UsageRange = "30d") => this.request<{ data: UsageReport }>(`/v1/usage?range=${encodeURIComponent(range)}`),
    shareLinks: {
      list: () => this.request<{ data: UsageShareLink[] }>("/v1/usage/share-links"),
      create: (input: CreateUsageShareLinkInput = {}) => this.request<{ data: CreatedUsageShareLink }>("/v1/usage/share-links", {
        method: "POST",
        ...json(input),
      }),
      revoke: (id: string) => this.request<void>(`/v1/usage/share-links/${encodeURIComponent(id)}`, { method: "DELETE" }),
      exchange: (token: string) => this.request<{ data: UsageReport }>("/v1/usage/share-links/exchange", {
        method: "POST",
        ...json({ token }),
      }, "none"),
    },
  };

  apiKeys = {
    list: () => this.request<{ data: DeveloperApiKey[] }>("/developer/api-keys", {}, "accessToken"),
    create: (input: { name?: string; scopes?: DeveloperScope[]; expiresAt?: string } = {}) => this.request<CreatedDeveloperApiKey & { warning: string }>("/developer/api-keys", { method: "POST", ...json(input) }, "accessToken"),
    revoke: (id: string) => this.request<void>(`/developer/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }, "accessToken"),
  };

  integrations = {
    status: () => this.request<{ emailIntegration: { configured: boolean; requiredAts: string[] } }>("/secrets/status", {}, "accessToken"),
    connectGmail: (input: { gmailUser: string; gmailAppPassword: string }) => this.request<{ ok: true; verified: true }>("/secrets/email-integration", { method: "PUT", ...json(input) }, "accessToken"),
  };
}
