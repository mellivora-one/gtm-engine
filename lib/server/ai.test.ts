import test from "node:test";
import assert from "node:assert/strict";
import { handleAnalysis } from "./ai.ts";
import { blobLedger } from "./blob-ledger.ts";

test("invalid origin, payload, oversized body and unsafe URL never reach the spending store", async () => {
  const key = process.env.OPENAI_API_KEY,
    blob = process.env.BLOB_READ_WRITE_TOKEN;
  const read = blobLedger.read;
  let reads = 0;
  process.env.OPENAI_API_KEY = "test-only-no-live-calls";
  process.env.BLOB_READ_WRITE_TOKEN = "test-only-no-live-calls";
  blobLedger.read = async () => {
    reads++;
    throw new Error("No storage call should be made.");
  };
  const valid = {
    runId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    description: "A product that helps support teams write customer replies.",
    url: "",
  };
  const request = (body: unknown, origin = "https://test.example") =>
    new Request("https://test.example/api/ai/brief", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await handleAnalysis(request(valid, "https://other.example"), "brief"))
        .status,
      403,
    );
    assert.equal(
      (
        await handleAnalysis(
          request({ ...valid, description: "short" }),
          "brief",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await handleAnalysis(
          request({ ...valid, description: "x".repeat(19_000) }),
          "brief",
        )
      ).status,
      413,
    );
    assert.equal(
      (
        await handleAnalysis(
          request({ ...valid, url: "javascript:alert(1)" }),
          "brief",
        )
      ).status,
      400,
    );
    for (const url of ["http://127.0.0.1", "https://linkedin.com/in/person"]) {
      assert.equal((await handleAnalysis(request({ ...valid, url }), "brief")).status, 400);
    }
    assert.equal((await handleAnalysis(request({ runId: crypto.randomUUID(), requestId: crypto.randomUUID(), search: { query: "x", count: "25" } }), "discover")).status, 400);
    assert.equal(reads, 0);
  } finally {
    blobLedger.read = read;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
    if (blob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = blob;
  }
});
