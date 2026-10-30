import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import { GateError, ledgerSchema, type LedgerStore } from "./budget.ts";

export const LEDGER_PATH = "gtm-engine/ai-budget-v1.json";
export const blobLedger: LedgerStore = {
  async read() {
    const result = await get(LEDGER_PATH, {
      access: "private",
      useCache: false,
      abortSignal: AbortSignal.timeout(8000),
    });
    if (!result || result.statusCode !== 200 || !result.stream)
      throw new GateError(
        "budget_unavailable",
        503,
        "The spending guard is unavailable. AI requests are disabled until it is restored.",
      );
    const ledger = ledgerSchema.parse(await new Response(result.stream).json());
    return { ledger, etag: result.blob.etag };
  },
  async write(ledger, etag) {
    await put(LEDGER_PATH, JSON.stringify(ledger), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      ifMatch: etag,
      contentType: "application/json",
      abortSignal: AbortSignal.timeout(8000),
    });
  },
  isConflict(error) {
    return error instanceof BlobPreconditionFailedError;
  },
};
