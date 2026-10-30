import test from "node:test";
import assert from "node:assert/strict";
import { zodTextFormat } from "openai/helpers/zod";
import {
  briefSchema,
  customerSchema,
  BUDGET_MICROS,
  RESERVATION_MICROS,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_TOKENS,
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
  version: 1,
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

test("the pinned model's bounded request fits well below its reservation", () => {
  const schemaBytes = Math.max(
    ...[briefSchema, customerSchema].map((schema) =>
      Buffer.byteLength(JSON.stringify(zodTextFormat(schema, "test"))),
    ),
  );
  // UTF-8 bytes bound text tokens; allowance covers fixed instructions and message overhead.
  const upperInputTokens = MAX_INPUT_BYTES + schemaBytes + 10_000;
  const conservativeCostMicros = Math.ceil(
    upperInputTokens * 0.4 + MAX_OUTPUT_TOKENS * 1.6,
  );
  assert.ok(conservativeCostMicros < RESERVATION_MICROS);
  assert.equal(400 * RESERVATION_MICROS, BUDGET_MICROS);
});
