import type { ApplicationInput, CandidateContext } from "../src/index.js";

const catalogTarget: ApplicationInput = {
  jobId: "951f7024-bbf7-4aa5-98fc-f45625584f9b",
  mode: "managed",
};

const urlTarget: ApplicationInput = {
  jobUrl: "https://boards.greenhouse.io/example/jobs/123",
  ats: "greenhouse",
  mode: "agent",
};

const clearAddress: CandidateContext = { address: null };

// @ts-expect-error An application must identify exactly one target.
const missingTarget: ApplicationInput = { mode: "managed" };

// @ts-expect-error jobId and jobUrl are mutually exclusive.
const ambiguousTarget: ApplicationInput = {
  jobId: "951f7024-bbf7-4aa5-98fc-f45625584f9b",
  jobUrl: "https://boards.greenhouse.io/example/jobs/123",
};

void catalogTarget;
void urlTarget;
void clearAddress;
void missingTarget;
void ambiguousTarget;
