import test from "node:test";
import assert from "node:assert/strict";
import { analysisOptions, maximumCostMicros, estimateCostMicros, SOL_RATES } from "./analysis-config.ts";
import {
  BUDGET_MICROS,
  RESERVATION_MICROS,
} from "../ai-schema.ts";
import {
  GateError,
  reserve,
  reserveInLedger,
  type Ledger,
  type LedgerStore,
  type Reservation,
} from "./budget.ts";

const now = 1_000_000;
const empty = (): Ledger => ({
  version: 2,
  startsAt: 0,
  endsAt: now + 72 * 3_600_000,
  budgetMicros: BUDGET_MICROS,
  reservationMicros: RESERVATION_MICROS,
  reservations: [],
});
const item = (id: string, at = now): Reservation => ({
  id,
  runId: "run",
  actor: id,
  kind: "brief",
  at,
  status: "reserved",
});

test("expiry, budget, rate and duplicate gates reject without mutating the ledger", () => {
  const ledger = empty();
  ledger.reservations = Array.from({ length: 400 }, (_, i) =>
    item(String(i), now - 120_000),
  );
  assert.throws(
    () => reserveInLedger(ledger, item("extra"), now),
    (error: unknown) =>
      error instanceof GateError && error.code === "budget_exhausted",
  );
  assert.equal(ledger.reservations.length, 400);
  assert.throws(
    () => reserveInLedger(empty(), item("x"), empty().endsAt),
    (error: unknown) => error instanceof GateError && error.code === "expired",
  );
  const completed = { ...item("existing"), status: "completed" as const };
  const prior = { ...empty(), reservations: [completed] };
  assert.throws(
    () => reserveInLedger(prior, item("existing"), now),
    (error: unknown) =>
      error instanceof GateError && error.code === "duplicate",
  );
  assert.equal(prior.reservations[0].status, "completed");
  const rate = {
    ...empty(),
    reservations: Array.from({ length: 3 }, (_, i) => ({
      ...item(String(i)),
      actor: "same",
    })),
  };
  assert.throws(
    () => reserveInLedger(rate, { ...item("fourth"), actor: "same" }, now),
    (error: unknown) =>
      error instanceof GateError && error.code === "rate_limited",
  );
});

test("concurrent reservations cannot both acquire the final budget slot", async () => {
  let ledger = empty();
  ledger.reservations = Array.from({ length: 399 }, (_, i) =>
    item(String(i), now - 120_000),
  );
  let version = 1;
  class Conflict extends Error {}
  const store: LedgerStore = {
    async read() {
      return { ledger: structuredClone(ledger), etag: String(version) };
    },
    async write(updated, etag) {
      if (etag !== String(version)) throw new Conflict();
      ledger = structuredClone(updated);
      version++;
    },
    isConflict(error) {
      return error instanceof Conflict;
    },
  };
  const results = await Promise.allSettled([
    reserve(store, item("a"), () => now),
    reserve(store, item("b"), () => now),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(ledger.reservations.length, 400);
  const denied = results.find((result) => result.status === "rejected");
  assert.ok(
    denied?.status === "rejected" &&
      denied.reason instanceof GateError &&
      denied.reason.code === "budget_exhausted",
  );
});

test("unavailable storage and persistent conflicts fail closed", async () => {
  let writes = 0;
  await assert.rejects(
    reserve(
      {
        async read() {
          throw new Error("offline");
        },
        async write() {
          writes++;
        },
        isConflict() {
          return false;
        },
      },
      item("x"),
    ),
    /offline/,
  );
  assert.equal(writes, 0);
  await assert.rejects(
    reserve(
      {
        async read() {
          return { ledger: empty(), etag: "1" };
        },
        async write() {
          writes++;
          throw new Error("conflict");
        },
        isConflict() {
          return true;
        },
      },
      item("x"),
      () => now,
    ),
    (error: unknown) =>
      error instanceof GateError && error.code === "ledger_busy",
  );
  assert.equal(writes, 5);
});

test("Sol request compatibility and worst-case cost stay inside the unchanged reservation", () => {
  for (const kind of ["brief", "profile", "discover"] as const) {
    const options = analysisOptions(kind);
    assert.equal(options.model, "gpt-6.1-sol");
    assert.equal(options.reasoning.effort, "low");
    assert.equal(options.service_tier, "default");
    assert.equal(options.prompt_cache_options.ttl, "30m");
    assert.equal("temperature" in options, false);
    assert.equal(options.store, false);
    assert.equal(options.text.format.type, "json_schema");
    assert.ok(maximumCostMicros(kind) <= RESERVATION_MICROS);
  }
  assert.deepEqual(SOL_RATES, { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 });
  // output_tokens includes reasoning: 1,000 output tokens are charged once.
  assert.equal(estimateCostMicros({ input_tokens: 3000, output_tokens: 1000,
    input_tokens_details: { cached_tokens: 1000, cache_write_tokens: 1000 } }), 14600);
  assert.equal(estimateCostMicros(undefined), undefined);
  assert.equal(RESERVATION_MICROS, 100_000);
  assert.equal(400 * RESERVATION_MICROS, BUDGET_MICROS);
});


test("the 200-credit Tavily cap shares atomic reservation protection without resetting OpenAI's window", async () => {
  let ledger = empty();
  ledger.reservations = Array.from({ length: 199 }, (_, i) => ({ ...item(String(i), now - 120_000), tavilyReservedCredits: 1 as const }));
  let version = 1;
  class Conflict extends Error {}
  const store: LedgerStore = {
    async read() { return { ledger: structuredClone(ledger), etag: String(version) }; },
    async write(updated, etag) { if (etag !== String(version)) throw new Conflict(); ledger = updated; version++; },
    isConflict(error) { return error instanceof Conflict; },
  };
  const results = await Promise.allSettled(["a", "b"].map(id => reserve(store, { ...item(id), tavilyReservedCredits: 1 }, () => now)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(ledger.reservations.filter(r => r.tavilyReservedCredits).length, 200);
  assert.equal(ledger.endsAt, empty().endsAt);
  await reserve(store, item("description-only"), () => now);
});
