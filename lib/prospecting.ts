import { z } from "zod";
import type { DiscoveryResult } from "./discovery.ts";

export const publishedEmailSchema = z.object({ email: z.email().max(254), quote: z.string().max(240) });
export const contactResearchSchema = z.object({
  companyName: z.string().max(100), companyWebsite: z.url().max(2000), searchedAt: z.string().datetime(), requestId: z.string().max(200),
  contacts: z.array(publishedEmailSchema.extend({ sourceUrl: z.url().max(2000) })).max(5),
  sources: z.array(z.object({ url: z.url().max(2000), title: z.string().max(180) })).max(20),
});
export type ContactResearch = z.infer<typeof contactResearchSchema>;
export const draftSchema = z.object({ companyName: z.string().max(100), to: z.string().max(254), subject: z.string().max(200), body: z.string().max(4000), status: z.enum(["draft", "approved"]), approvedAt: z.string().optional() });
export type OutreachDraft = z.infer<typeof draftSchema>;
export const prospectingSchema = z.object({ researchId: z.string().max(200), contacts: z.array(contactResearchSchema).max(10), drafts: z.array(draftSchema).max(10) });
export type Prospecting = z.infer<typeof prospectingSchema>;

export function publishedEmails(content: string, sourceUrl: string, confirmedDomain?: string) {
  const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  // Directory, social and consumer addresses cannot become company contacts.
  if (!confirmedDomain && /(^|\.)(ycombinator\.com|linkedin\.com|crunchbase\.com|facebook\.com|gmail\.com|outlook\.com|yahoo\.com)$/.test(host)) return [];
  const emailHost=confirmedDomain ?? host;
  const found: z.infer<typeof publishedEmailSchema>[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = match[0].toLowerCase();
    const domain = email.split("@")[1];
    if (seen.has(email) || !(domain === emailHost || domain.endsWith(`.${emailHost}`)) || /^(noreply|no-reply|donotreply)@/.test(email)) continue;
    if (!z.email().safeParse(email).success) continue;
    seen.add(email);
    const start = Math.max(0, match.index! - 65);
    found.push({ email, quote: content.slice(start, match.index! + email.length + 65).slice(0, 240) });
    if (found.length >= 3) break;
  }
  return found;
}

export function relationshipGraph(product: string, research: DiscoveryResult, contacts: ContactResearch[]) {
  const nodes: { id: string; label: string; type: "Product" | "Company" | "Source" | "Contact" }[] = [{ id: "product", label: product, type: "Product" }];
  const edges: { from: string; to: string; type: string; evidence?: string }[] = [];
  for (const [index, company] of research.leads.entries()) {
    const id = `company-${index}`;
    nodes.push({ id, label: company.companyName, type: "Company" });
    edges.push({ from: id, to: "product", type: "matched_to (AI inference)", evidence: company.fitReason });
    for (const sourceId of company.sourceIds) {
      const source = research.sources.find(s => s.id === sourceId); if (!source) continue;
      const sid = `source-${sourceId}`;
      if (!nodes.some(n => n.id === sid)) nodes.push({ id: sid, label: source.url, type: "Source" });
      edges.push({ from: id, to: sid, type: "supported_by", evidence: company.evidenceQuote });
    }
    for (const contact of contacts.find(c => c.companyName === company.companyName)?.contacts ?? []) {
      const cid = `email-${contact.email}`;
      if (!nodes.some(n => n.id === cid)) nodes.push({ id: cid, label: contact.email, type: "Contact" });
      edges.push({ from: id, to: cid, type: "published_contact (unverified)", evidence: contact.sourceUrl });
    }
  }
  return { storage: "browser-local; no graph database connected", nodes, edges };
}
