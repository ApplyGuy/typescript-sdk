# Apply Guy TypeScript SDK

[![CI](https://github.com/ApplyGuy/typescript-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/ApplyGuy/typescript-sdk/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The official, zero-runtime-dependency TypeScript client for the
[Apply Guy Developer API](https://applyguy.ai/developers). Search fresh U.S.
jobs, manage a candidate profile, and submit applications through pure HTTP.

## Requirements

- Node.js 18 or newer
- An Apply Guy developer API key

This is an ESM package and uses the native Fetch, Blob, and FormData APIs.

## Install

~~~bash
npm install @applyguy/sdk
~~~

Before the first npm release, install directly from GitHub:

~~~bash
npm install github:ApplyGuy/typescript-sdk
~~~

## Quick start

~~~ts
import { ApplyGuy } from "@applyguy/sdk";

const applyGuy = new ApplyGuy({
  apiKey: process.env.APPLYGUY_API_KEY!,
});

const search = await applyGuy.jobs.search({
  q: "software engineer",
  remote: "remote",
  limit: 25,
});

console.log(search.data);
console.log(search.creditUsage?.cost); // 0.05
console.log(search.creditUsage?.balance);
~~~

## Submit a managed application

Managed mode costs 2 credits. Apply Guy discovers the employer form, resolves
its questions from the stored candidate profile, and submits it.

~~~ts
const job = search.data[0];
if (!job) throw new Error("No matching job found.");

const preflight = await applyGuy.applications.preflight({
  jobId: job.id,
  mode: "managed",
});

if (!preflight.data.ready) {
  throw new Error(
    `Application is not ready: ${preflight.data.missingProfileFields.join(", ")}`,
  );
}

const queued = await applyGuy.applications.create(
  { jobId: job.id, mode: "managed" },
  crypto.randomUUID(),
);

console.log(queued.data.id, queued.data.status);
~~~

The second argument is an idempotency key. Reusing it for the same request
returns the original application instead of charging twice.

## Bring your own answering agent

Agent mode costs 1 credit. Apply Guy handles form discovery, uploads, ATS
sessions, and submission while your agent generates the structured answers.
An application may request more than one answer round.

~~~ts
const queued = await applyGuy.applications.create(
  { jobId: job.id, mode: "agent" },
  crypto.randomUUID(),
);

while (true) {
  const { data: application } = await applyGuy.applications.get(queued.data.id);

  if (application.status === "success" || application.status === "failed") {
    console.log(application.status, application.outcomeCode);
    break;
  }

  if (application.status === "awaiting_answers") {
    const { data: request } =
      await applyGuy.applications.answerRequest(application.id);

    // Call your model with request.prompt and constrain its output to
    // request.responseSchema.
    const answer = await yourAgent.generate({
      prompt: request.prompt,
      responseSchema: request.responseSchema,
    });

    await applyGuy.applications.answer(application.id, {
      requestId: request.id,
      fingerprint: request.fingerprint,
      answer,
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
~~~

The server validates the answer against the exact JSON Schema it supplied.
Malformed answers fail immediately instead of reaching an employer.

## Create an account and API key programmatically

The bootstrap endpoint creates an account and returns the first API key plus
short-lived account tokens. Payment remains the only required human step.

~~~ts
const bootstrap = await ApplyGuy.bootstrap({
  email: "developer@example.com",
  password: process.env.APPLYGUY_ACCOUNT_PASSWORD!,
  name: "Production agent",
});

const applyGuy = new ApplyGuy({
  apiKey: bootstrap.apiKey.key,
  accessToken: bootstrap.accessToken,
});
~~~

The API key and refresh token are returned once. Store them in a secret
manager. The account access token is used for API-key and integration
management; normal `/v1` operations use the developer API key.

## Candidate profile and resume

~~~ts
import { readFile } from "node:fs/promises";

await applyGuy.profile.update({
  firstName: "Jordan",
  lastName: "Bamber",
  email: "jordan@example.com",
  phone: "+1 415 555 0199",
  location: "San Francisco, CA",
  address: {
    line1: "501 Delancey Street",
    city: "San Francisco",
    state: "California",
    postalCode: "94107",
    country: "United States of America",
  },
  workAuthorization: {
    country: "US",
    status: "citizen",
    requiresSponsorship: false,
  },
});

const resume = await readFile("./resume.pdf");
await applyGuy.profile.uploadResume(
  new Blob([resume], { type: "application/pdf" }),
  "resume.pdf",
);
~~~

## Errors and retries

Non-2xx responses throw `ApplyGuyApiError` with the public error code,
structured details, request ID, and parsed Retry-After delay when present.

~~~ts
import { ApplyGuyApiError } from "@applyguy/sdk";

try {
  await applyGuy.applications.create(
    { jobUrl: "https://boards.greenhouse.io/example/jobs/123", mode: "managed" },
    crypto.randomUUID(),
  );
} catch (error) {
  if (error instanceof ApplyGuyApiError) {
    console.error(error.status, error.code, error.requestId, error.details);
    if (error.retryAfterSeconds !== undefined) {
      console.error(`Retry in ${error.retryAfterSeconds} seconds`);
    }
  }
}
~~~

## Credits

- 20 credits per U.S. dollar
- Managed application: 2 credits
- Bring-your-own-agent application: 1 credit
- Job search: 0.05 credit per requested block of up to 25 results
- Job detail: 0.01 credit when the request returns 200
- Application preflight: free

Successful metered job reads expose decimal and exact milli-credit values on
`creditUsage`. Invalid requests, missing jobs, rate limits, and server errors
are not charged.

~~~ts
const { data: credits } = await applyGuy.credits.get();
console.log(credits.balance, credits.balanceMilli);

const checkout = await applyGuy.credits.checkout(2_500); // $25.00
console.log(checkout.data.checkoutUrl);
~~~

## API surface

- `jobs`: search and job detail
- `profile`: read/update candidate context and upload a resume
- `credits`: balance, pricing, checkout, and checkout status
- `applications`: preflight, create, list, poll, answer, and cancel
- `webhooks`: list, create, update, and delete endpoints
- `usage`: analytics and revocable share links
- `apiKeys`: list, create, and revoke keys using an account access token
- `integrations`: inspect and configure the Workday Gmail integration

See the complete generated
[OpenAPI reference](https://applyguy.ai/developers/docs/reference) and
[developer guides](https://applyguy.ai/developers/docs).

## Security

Use this SDK only in trusted server-side code. Never expose an Apply Guy API
key, account access token, Gmail app password, candidate profile, or resume in
a browser bundle or public repository.

Custom remote base URLs must use HTTPS. Plain HTTP is accepted only for
loopback development hosts.

Please report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
