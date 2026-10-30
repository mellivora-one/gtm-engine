import { z } from "zod";
import { productSchema, profileSchema, metaSchema } from "./ai-schema.ts";

export const focusSchema = z.enum(["Product fit and buying signals", "Product fit", "Recent buying signals"]);
export const discoverySearchSchema = z.object({
  count: z.enum(["5", "10"]), focus: focusSchema,
  query: z.string().trim().min(8).max(300),
});
export const discoveryInputSchema = z.object({
  runId: z.uuid(), requestId: z.uuid(),
  product: productSchema.extend({ name: z.string().trim().min(1).max(120), description: z.string().trim().min(10).max(2000) }),
  profile: profileSchema.extend({ industry: z.string().trim().min(1).max(200) }),
  search: discoverySearchSchema,
});
export const searchSourceSchema = z.object({
  id: z.string().regex(/^S\d{1,2}$/),
  url: z.string().url().max(2000).refine(value => {
    try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
  }),
  title: z.string().max(180), excerpt: z.string().max(1000),
  operatingStatus: z.enum(["active", "inactive"]).optional(),
  teamSize: z.number().int().nonnegative().max(1000000).optional(),
});
export const leadSchema = z.object({
  companyName: z.string().min(2).max(100),
  sourceIds: z.array(z.string().regex(/^S\d{1,2}$/)).min(1).max(3),
  evidenceQuote: z.string().min(15).max(400),
  fit: z.enum(["strong", "possible", "weak"]),
  fitReason: z.string().max(300),
  gaps: z.array(z.string().max(120)).max(3),
});
export const discoverySchema = z.object({
  leads: z.array(leadSchema).max(10),
  limitations: z.array(z.string().max(250)).max(3),
});
export const discoveryResultSchema = discoverySchema.extend({
  meta: metaSchema, sources: z.array(searchSourceSchema).max(20),
  query: z.string().max(300), searchedAt: z.string().datetime(),
  searchRequestId: z.string().max(200),
});
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;
export type SearchSource = z.infer<typeof searchSourceSchema>;
export type DiscoveryInput = z.infer<typeof discoveryInputSchema>;

export function defaultDiscoveryQuery(profile: Pick<z.infer<typeof profileSchema>, "industry" | "location"> & { size?: string }, focus: string): string {
  // Start broad enough to find named companies. Size and buying triggers are
  // assessed from evidence, never assumed because they appear in the query.
  if (/saas/i.test(profile.industry) && /1–10|11–50/.test(profile.size ?? "") && focus !== "Recent buying signals")
    return "site:ycombinator.com/companies B2B SaaS software";
  const terms = `${profile.industry} startup companies ${profile.location} ${focus === "Recent buying signals" ? "recent funding expansion hiring" : "products customers"}`;
  return terms.replace(/\s+/g, " ").trim().slice(0, 300);
}
export function discoveryContext(product: unknown, profile: unknown, search: unknown): string {
  try { return JSON.stringify({ product: productSchema.parse(product), profile: profileSchema.parse(profile), search: discoverySearchSchema.parse(search) }); }
  catch { return ""; }
}

const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const words = (value: string) => normalized(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Only server-supplied sources can back a result. Reject invented IDs, names,
// paraphrased quotes, duplicate companies, and the user's own product.
export function groundLeads(analysis: z.infer<typeof discoverySchema>, sources: SearchSource[], ownProduct: string, count: number, sizeTier = "") {
  const seen = new Set<string>();
  const leads = analysis.leads.map(lead => ({ ...lead, sourceIds: [...new Set(lead.sourceIds)] })).filter(lead => {
    const name = words(lead.companyName);
    if (name === words(ownProduct) || seen.has(name)) return false;
    const cited = lead.sourceIds.map(id => sources.find(s => s.id === id));
    if (cited.some(s => !s || s.operatingStatus === "inactive")) return false;
    const bounds = sizeTier.replaceAll(",", "").match(/\d+/g)?.map(Number);
    const knownSizes = cited.filter(s => s && ` ${words(s.title)} `.startsWith(` ${name} `) && s.teamSize !== undefined).map(s => s!.teamSize!);
    if (bounds?.length && knownSizes.length && knownSizes.every(size => size < bounds[0] || size > (bounds[1] ?? Infinity))) return false;
    const valid = cited.some(s => s && normalized(`${s.title} ${s.excerpt}`).includes(normalized(lead.evidenceQuote)))
      && cited.some(s => s && ` ${words(`${s.title} ${s.excerpt} ${s.url}`)} `.includes(` ${name} `));
    if (valid) seen.add(name);
    return valid;
  }).slice(0, count);
  return { leads, limitations: analysis.limitations };
}
