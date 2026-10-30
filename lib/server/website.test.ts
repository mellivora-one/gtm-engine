import test from "node:test";
import assert from "node:assert/strict";
import { websiteUrl, publicAddress, extractWebsite } from "./website.ts";

test("only public website targets are accepted, never LinkedIn, local IPs, credentials or nonstandard ports", () => {
  assert.equal(websiteUrl("stripe.com/#pricing"), "https://stripe.com/");
  for (const url of ["https://linkedin.com/in/person", "https://www.linkedin.com./company/test", "http://127.0.0.1", "http://[::1]", "http://example.local", "https://a:b@stripe.com", "https://stripe.com:8443", "file:///etc/passwd"])
    assert.throws(() => websiteUrl(url));
  for (const address of ["10.1.1.1", "169.254.169.254", "127.0.0.1", "192.168.1.1", "100.64.0.1", "::1", "fc00::1", "::ffff:127.0.0.1", "2001:db8::1"])
    assert.equal(publicAddress(address), false);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});

test("extraction uses one fixed basic request, bounds evidence, and rejects empty, mismatched and failed responses without retries", async () => {
  const prior = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-only";
  let calls = 0;
  const mocked = (body: unknown, status = 200): typeof fetch => async (url, init) => {
    calls++;
    assert.equal(url, "https://api.tavily.com/extract");
    const input = JSON.parse(String(init?.body));
    assert.deepEqual(input.urls, ["https://stripe.com/"]);
    assert.equal(input.extract_depth, "basic");
    assert.equal(init?.redirect, "error");
    return Response.json(body, { status });
  };
  try {
    const result = await extractWebsite("https://stripe.com/", new AbortController().signal,
      mocked({ results: [{ url: "https://stripe.com/", raw_content: "Product information. ".repeat(1000) }], request_id: "receipt", usage: { credits: 0 } }));
    assert.equal(result.requestId, "receipt");
    assert.equal(result.credits, 0);
    assert.equal(result.truncated, true);
    assert.ok(Buffer.byteLength(result.content) <= 8000);
    for (const body of [{ results: [], failed_results: [{ error: "blocked" }] }, { results: [{ url: "https://other.com/", raw_content: "wrong page".repeat(100) }] }])
      await assert.rejects(extractWebsite("https://stripe.com/", new AbortController().signal, mocked(body)), /No useful website text/);
    await assert.rejects(extractWebsite("https://stripe.com/", new AbortController().signal, mocked({}, 401)), /could not read/);
    assert.equal(calls, 4);
  } finally {
    if (prior === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = prior;
  }
});
