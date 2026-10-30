import { publishedEmails } from "../prospecting.ts";
import { websiteUrl } from "./website.ts";
import { GateError } from "./budget.ts";
import type { SearchSource } from "../discovery.ts";

export async function searchCompanies(query: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  if (!process.env.TAVILY_API_KEY) throw new GateError("tavily_not_configured", 503, "Company search is not configured. You can still export your plan.");
  let response: Response;
  try {
    response = await fetcher("https://api.tavily.com/search", {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, search_depth: "basic", auto_parameters: false,
        max_results: 20, chunks_per_source: 3, topic: "general", include_answer: false,
        include_raw_content: "text", include_images: false, include_usage: true,
        exclude_domains: ["linkedin.com", "facebook.com", "instagram.com", "x.com"] }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
    });
  } catch { throw new GateError("search_unavailable", 502, "Tavily search timed out or failed. No automatic retry was made; your previous results are preserved."); }
  if (!response.ok || !response.body) throw new GateError("search_unavailable", 502, "Tavily could not complete this search. No automatic retry was made. Please try again later or export your plan.");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 1_000_000) { await reader.cancel(); throw new GateError("search_too_large", 502, "The search response was too large. Try a more focused query."); }
    chunks.push(value);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new GateError("search_unavailable", 502, "Tavily returned an unreadable response. Your previous results are preserved."); }
  const sources: SearchSource[] = []; const seen = new Set<string>();
  for (const item of Array.isArray(data?.results) ? data.results : []) {
    if (sources.length >= 20) break;
    let url: string;
    try { url = websiteUrl(item.url); } catch { continue; }
    if (seen.has(url) || typeof item.content !== "string" || item.content.trim().length < 30) continue;
    seen.add(url);
    // YC direct-company pages expose explicit team/status metadata that can be
    // absent from ranked search snippets. Never apply a directory's metadata
    // to all the companies it mentions, or mistake "Active Founders" for status.
    const parsed = new URL(url);
    const raw = typeof item.raw_content === "string" ? item.raw_content : "";
    const directProfile = /(^|\.)ycombinator\.com$/.test(parsed.hostname)
      && /^\/companies\/[^/]+\/?$/.test(parsed.pathname);
    const status = directProfile ? raw.match(/\bStatus\s*:\s*(Inactive|Active)\b/i)?.[1]?.toLowerCase() as "active" | "inactive" | undefined : undefined;
    const teamMatch = directProfile ? raw.match(/\bTeam\s*Size\s*:\s*(\d+)/i)?.[1] : undefined;
    const teamSize = teamMatch !== undefined && Number(teamMatch) <= 1000000 ? Number(teamMatch) : undefined;
    sources.push({ id: `S${sources.length + 1}`, url,
      title: typeof item.title === "string" ? item.title.slice(0, 180) : new URL(url).hostname,
      excerpt: item.content.trim().slice(0, 1000),
      publishedEmails: publishedEmails(`${item.content}\n${raw}`, url),
      ...(status ? { operatingStatus: status } : {}), ...(teamSize !== undefined ? { teamSize } : {}) });
  }
  if (!sources.length) throw new GateError("search_empty", 422, "No usable public sources were returned. Edit the query and try again; no company results were invented and OpenAI was not called.");
  return { sources, requestId: typeof data.request_id === "string" ? data.request_id.slice(0, 200) : "",
    credits: typeof data.usage?.credits === "number" && data.usage.credits >= 0 ? data.usage.credits : undefined,
    searchedAt: new Date().toISOString() };
}
