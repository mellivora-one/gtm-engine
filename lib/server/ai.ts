import OpenAI from "openai";
import { createHmac } from "node:crypto";
import {
  briefInputSchema,
  customerInputSchema,
  briefSchema,
  customerSchema,
  MODEL,
  MAX_INPUT_BYTES,
  type AIKind,
} from "../ai-schema.ts";
import { validateWebsite, extractWebsite } from "./website.ts";
import type { BriefResult } from "../ai-schema.ts";
import { blobLedger } from "./blob-ledger.ts";
import { GateError, reserve, settle } from "./budget.ts";
import { analysisOptions, assertCostBound, estimateCostMicros } from "./analysis-config.ts";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function handleAnalysis(
  request: Request,
  kind: AIKind,
): Promise<Response> {
  let reservationId: string | undefined;
  let reserved = false;
  const started = Date.now();
  try {
    if (!process.env.OPENAI_API_KEY || !process.env.BLOB_READ_WRITE_TOKEN)
      throw new GateError(
        "not_configured",
        503,
        "AI is not configured. You can continue manually without a paid request.",
      );
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      throw new GateError(
        "origin_rejected",
        403,
        "Please submit this request from the GTM Engine website.",
      );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new GateError("invalid_content_type", 415, "Use a JSON request.");
    if (!request.body)
      throw new GateError("empty_body", 400, "Please add product information.");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_INPUT_BYTES) {
        await reader.cancel();
        throw new GateError(
          "too_large",
          413,
          "Please shorten the product information and try again.",
        );
      }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new GateError(
        "invalid_json",
        400,
        "The request could not be read. Please try again.",
      );
    }
    const parsed =
      kind === "brief"
        ? briefInputSchema.safeParse(json)
        : customerInputSchema.safeParse(json);
    if (!parsed.success)
      throw new GateError(
        "invalid_input",
        400,
        kind === "brief"
          ? "Add a public product website URL or at least 20 characters describing the product."
          : "Please provide a product name and description before generating customers.",
      );
    const input = parsed.data;
    let website = "";
    if ("url" in input) {
      if (input.url.trim()) website = await validateWebsite(input.url);
      if (!website && input.description.length < 20)
        throw new GateError("invalid_input", 400, "Add at least 20 characters describing your product, or enter a public product website.");
      if (website && !process.env.TAVILY_API_KEY)
        throw new GateError("tavily_not_configured", 503, "Website reading is not configured. Remove the link to use a description, or continue manually.");
    }
    const data = "product" in input
      ? { confirmedProduct: input.product }
      : { description: input.description };
    let userText = JSON.stringify(data);
    if (Buffer.byteLength(userText, "utf8") > MAX_INPUT_BYTES)
      throw new GateError(
        "too_large",
        413,
        "Please shorten the product information.",
      );
    const actorIp =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      (process.env.NODE_ENV === "development" ? "local-development" : null);
    if (!actorIp)
      throw new GateError(
        "client_unavailable",
        503,
        "The request could not be safely rate limited. No AI request was sent.",
      );
    const actor = createHmac("sha256", process.env.OPENAI_API_KEY)
      .update(actorIp)
      .digest("hex")
      .slice(0, 32);
    reservationId = `${input.runId}:${kind}:${input.requestId}`;
    assertCostBound(kind);
    await reserve(blobLedger, {
      id: reservationId,
      runId: input.runId,
      actor,
      kind,
      at: started,
      status: "reserved",
      ...(website ? { tavilyReservedCredits: 1 as const } : {}),
    });
    reserved = true;
    const sources: NonNullable<BriefResult["sources"]> = [];
    if (website) {
      const extraction = await extractWebsite(website, request.signal);
      await settle(blobLedger, reservationId, {
        tavilyRequestId: extraction.requestId,
        tavilyReportedCredits: extraction.credits,
      });
      const retrievedAt = new Date().toISOString();
      // Keep the original model-input ceiling even with retrieved content.
      let content = extraction.content;
      while (Buffer.byteLength(JSON.stringify({ ...data, websiteEvidence: { id: "S1", url: website, content } })) > MAX_INPUT_BYTES && content.length > 0)
        content = content.slice(0, Math.floor(content.length * 0.9));
      if (content.length < 80)
        throw new GateError("too_large", 413, "Please shorten your description to leave room for website evidence.");
      userText = JSON.stringify({ ...data, websiteEvidence: { id: "S1", url: website, content } });
      sources.push({ id: "S1", url: website, retrievedAt,
        provider: "Tavily Extract", excerpt: content.slice(0, 1200),
        truncated: extraction.truncated || content.length < extraction.content.length });
      console.info("website_extraction_completed", { runId: input.runId, requestId: extraction.requestId, credits: extraction.credits });
    }
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30_000,
      maxRetries: 0,
    });
    const response = await client.responses.parse(
      {
        ...analysisOptions(kind),
        input: userText,
      },
      {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]),
      },
    );
    const usage = response.usage;
    const estimatedCostMicros = estimateCostMicros(usage);
    await settle(blobLedger, reservationId, {
      status: "completed",
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      estimatedCostMicros,
      responseId: response.id,
    }).catch(() =>
      console.warn("ai_usage_record_pending", { runId: input.runId, kind }),
    );
    if (response.status !== "completed" || !response.output_parsed)
      throw new GateError(
        "incomplete",
        502,
        "The model did not return a complete result. Your input is preserved; no automatic retry was made.",
      );
    const output =
      kind === "brief"
        ? briefSchema.parse(response.output_parsed)
        : customerSchema.parse(response.output_parsed);
    console.info("ai_analysis_completed", {
      runId: input.runId,
      requestId: input.requestId,
      kind,
      responseId: response.id,
      model: MODEL,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      reasoningTokens: usage?.output_tokens_details?.reasoning_tokens,
      cacheWriteTokens: usage?.input_tokens_details?.cache_write_tokens,
      cachedTokens: usage?.input_tokens_details?.cached_tokens,
      durationMs: Date.now() - started,
    });
    return Response.json(
      {
        ...output,
        ...(kind === "brief" ? { sources } : {}),
        meta: {
          runId: input.runId,
          requestId: input.requestId,
          responseId: response.id,
          model: MODEL,
          generatedAt: new Date().toISOString(),
        },
      },
      { headers },
    );
  } catch (error) {
    // A reservation is never refunded on error: the provider may have processed it.
    if (reserved && reservationId)
      await settle(blobLedger, reservationId, { status: "unknown" }).catch(
        () => {},
      );
    const gate = error instanceof GateError;
    const status = gate
      ? error.status
      : error instanceof OpenAI.APIError && error.status === 429
        ? 503
        : 502;
    const message = gate
      ? error.message
      : error instanceof OpenAI.AuthenticationError
        ? "The OpenAI credential was rejected. No automatic retry was made."
        : "The AI service is temporarily unavailable. Your input is preserved; please try again or continue manually.";
    console.warn("ai_analysis_failed", {
      kind,
      code: gate ? error.code : "provider_or_guard_error",
      status,
    });
    return Response.json(
      { error: message, code: gate ? error.code : "ai_unavailable" },
      { status, headers },
    );
  }
}
