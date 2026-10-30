import { z } from "zod";

export const MODEL = "gpt-4.1-mini-2025-04-14";
export const MAX_OUTPUT_TOKENS = 3000;
export const MAX_INPUT_BYTES = 18_000;
export const RESERVATION_MICROS = 100_000;
export const BUDGET_MICROS = 40_000_000;

const short = z.string().max(500);
export const productSchema = z.object({
  name: z.string().max(120),
  description: z.string().max(2000),
  audience: short,
  benefit: short,
  features: z.string().max(1500),
  constraints: z.string().max(1000),
  pricing: short,
  customers: short,
});
export const insightSchema = z.object({
  field: z.string().max(80),
  origin: z.enum(["stated", "source", "inferred", "unknown"]),
  confidence: z.number().min(0).max(1),
  explanation: z.string().max(300),
});
export const briefSchema = z.object({
  product: productSchema,
  insights: z.array(insightSchema).max(10),
  assumptions: z.array(short).max(5),
  questions: z.array(short).max(3),
});
export const profileSchema = z.object({
  industry: z.string().max(200),
  size: z.enum([
    "",
    "1–10 employees",
    "11–50 employees",
    "51–200 employees",
    "201–1,000 employees",
    "1,001+ employees",
  ]),
  location: z.string().max(200),
  roles: z.array(z.string().min(1).max(100)).min(1).max(5),
  signals: z.array(z.string().max(140)).max(4),
  exclusions: z.string().max(500),
});
export const customerSchema = z.object({
  profile: profileSchema,
  insights: z.array(insightSchema).max(7),
  rationale: z.string().max(1000),
  assumptions: z.array(short).max(5),
  questions: z.array(short).max(3),
});
export type BriefAnalysis = z.infer<typeof briefSchema>;
export type CustomerAnalysis = z.infer<typeof customerSchema>;
export type AnalysisMeta = {
  runId: string;
  requestId: string;
  responseId: string;
  model: string;
  generatedAt: string;
};
export const sourceSchema = z.object({
  id: z.literal("S1"),
  url: z.string().url().max(2000).refine(value => {
    try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  }),
  retrievedAt: z.string(),
  excerpt: z.string().max(1200),
  truncated: z.boolean(),
  provider: z.literal("Tavily Extract"),
});
export type BriefResult = BriefAnalysis & { meta: AnalysisMeta; sources?: z.infer<typeof sourceSchema>[] };
export type CustomerResult = CustomerAnalysis & { meta: AnalysisMeta };
const metaSchema = z.object({
  runId: z.uuid(),
  requestId: z.uuid(),
  responseId: z.string(),
  model: z.string(),
  generatedAt: z.string(),
});
export const briefResultSchema = briefSchema.extend({ meta: metaSchema, sources: z.array(sourceSchema).max(1).optional() });
export const customerResultSchema = customerSchema.extend({ meta: metaSchema });
export type AIKind = "brief" | "profile";

const ids = { runId: z.uuid(), requestId: z.uuid() };
export const briefInputSchema = z.object({
  ...ids,
  description: z.string().trim().max(6000),
  url: z.string().max(2000),
});
export const customerInputSchema = z.object({
  ...ids,
  product: productSchema.extend({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(10).max(2000),
  }),
});
