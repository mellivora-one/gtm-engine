import { z } from "zod";
import { BUDGET_MICROS, RESERVATION_MICROS } from "../ai-schema.ts";

const reservationSchema = z.object({
  id: z.string(),
  runId: z.string(),
  actor: z.string(),
  kind: z.enum(["brief", "profile"]),
  at: z.number(),
  status: z.enum(["reserved", "completed", "unknown"]),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  estimatedCostMicros: z.number().optional(),
  responseId: z.string().optional(),
  tavilyReservedCredits: z.literal(1).optional(),
  tavilyRequestId: z.string().optional(),
  tavilyReportedCredits: z.number().nonnegative().optional(),
});
export const ledgerSchema = z.object({
  version: z.literal(2),
  startsAt: z.number(),
  endsAt: z.number(),
  budgetMicros: z.literal(BUDGET_MICROS),
  reservationMicros: z.literal(RESERVATION_MICROS),
  reservations: z.array(reservationSchema).max(400),
});
export type Ledger = z.infer<typeof ledgerSchema>;
export type Reservation = z.infer<typeof reservationSchema>;
export type LedgerStore = {
  read(): Promise<{ ledger: Ledger; etag: string }>;
  write(ledger: Ledger, etag: string): Promise<void>;
  isConflict(error: unknown): boolean;
};
export class GateError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function reserveInLedger(
  ledger: Ledger,
  reservation: Reservation,
  now: number,
): Ledger {
  if (now < ledger.startsAt || now >= ledger.endsAt)
    throw new GateError(
      "expired",
      403,
      "This three-day AI window has ended. You can still edit and export your work manually.",
    );
  if (ledger.reservations.some((item) => item.id === reservation.id))
    throw new GateError(
      "duplicate",
      409,
      "This request has already been submitted. Review the existing result before starting a new request.",
    );
  // One credit reserved for each single-page basic extraction, conservatively
  // above the published one-credit-per-five-successes rate. Never refund.
  if (reservation.tavilyReservedCredits &&
      ledger.reservations.reduce((sum, item) => sum + (item.tavilyReservedCredits ?? 0), 0) + 1 > 200)
    throw new GateError("tavily_budget_exhausted", 402,
      "The 200-credit Tavily demo allowance is exhausted. Remove the link to use your description, or continue manually.");
  if (
    (ledger.reservations.length + 1) * RESERVATION_MICROS >
    ledger.budgetMicros
  )
    throw new GateError(
      "budget_exhausted",
      402,
      "The application's AI budget allowance is exhausted. No new paid request was sent.",
    );
  const recent = ledger.reservations.filter((item) => now - item.at < 60_000);
  if (
    recent.length >= 12 ||
    recent.filter((item) => item.actor === reservation.actor).length >= 3
  )
    throw new GateError(
      "rate_limited",
      429,
      "Too many AI requests. Please wait a minute and try again.",
    );
  if (
    ledger.reservations.filter(
      (item) => item.actor === reservation.actor && now - item.at < 86_400_000,
    ).length >= 40
  )
    throw new GateError(
      "daily_limit",
      429,
      "This connection has reached its daily demo allowance. Your work is still available for manual editing.",
    );
  return { ...ledger, reservations: [...ledger.reservations, reservation] };
}

export async function reserve(
  store: LedgerStore,
  reservation: Reservation,
  now: () => number = Date.now,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { ledger, etag } = await store.read();
    const updated = reserveInLedger(ledger, reservation, now());
    try {
      await store.write(updated, etag);
      return;
    } catch (error) {
      if (!store.isConflict(error)) throw error;
    }
  }
  throw new GateError(
    "ledger_busy",
    503,
    "The spending guard is busy. No AI request was sent; please try again shortly.",
  );
}

export async function settle(
  store: LedgerStore,
  id: string,
  usage: Partial<Reservation>,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { ledger, etag } = await store.read();
    if (!ledger.reservations.some((item) => item.id === id))
      throw new Error("Reservation missing");
    const updated = {
      ...ledger,
      reservations: ledger.reservations.map((item) =>
        item.id === id
          ? {
              ...item,
              ...usage,
              id: item.id,
              actor: item.actor,
              runId: item.runId,
              kind: item.kind,
              at: item.at,
            }
          : item,
      ),
    };
    try {
      await store.write(updated, etag);
      return;
    } catch (error) {
      if (!store.isConflict(error)) throw error;
    }
  }
  throw new Error(
    "Usage recording conflicted; the full reservation remains charged.",
  );
}
