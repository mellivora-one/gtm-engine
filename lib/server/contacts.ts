import { z } from "zod";
import { createHmac } from "node:crypto";
import { GateError, reserve, settle } from "./budget.ts";
import { blobLedger } from "./blob-ledger.ts";
import { publishedEmails } from "../prospecting.ts";
import { extractWebsite, validateWebsite } from "./website.ts";
import { searchCompanies } from "./search.ts";
const inputSchema = z.object({ companyName: z.string().trim().min(2).max(100), website:z.string().trim().min(3).max(1500), sourceUrl:z.string().max(1500).optional(), readSource:z.boolean().optional(), runId: z.uuid(), requestId: z.uuid() });
export async function researchContacts(request: Request) {
  let id: string | undefined;
  let reserved = false;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new GateError("origin_rejected", 403, "Use the GTM Engine website.");
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new GateError("invalid_input", 415, "Use JSON.");
    if (!request.body) throw new GateError("invalid_input", 400, "Select a company.");
    const reader = request.body.getReader(); let text = ""; let bytes = 0; const decoder = new TextDecoder();
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2000) { await reader.cancel(); throw new GateError("too_large", 413, "Request too large."); } text += decoder.decode(value, {stream:true}); }
    const parsed = inputSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new GateError("invalid_input", 400, "Select a valid company.");
    const companyWebsite=await validateWebsite(parsed.data.website);
    const domain=new URL(companyWebsite).hostname.replace(/^www\./, "");
    let companySource="";
    if(parsed.data.readSource){
      companySource=await validateWebsite(parsed.data.sourceUrl ?? "");const source=new URL(companySource);
      if(!/(^|\.)ycombinator\.com$/.test(source.hostname) || !/^\/companies\/[^/]+\/?$/.test(source.pathname))throw new GateError("invalid_source",400,"Use the direct company profile source.");
    }
    if (!process.env.OPENAI_API_KEY || !process.env.BLOB_READ_WRITE_TOKEN || !process.env.TAVILY_API_KEY) throw new GateError("not_configured", 503, "Contact research is not configured.");
    const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || (process.env.NODE_ENV === "development" ? "local-development" : "");
    if (!ip) throw new GateError("client_unavailable", 503, "The request could not be safely rate limited.");
    const input = parsed.data;
    const actor = createHmac("sha256", process.env.OPENAI_API_KEY).update(ip).digest("hex").slice(0,32);
    id = `${input.runId}:contacts:${input.requestId}`;
    // Reuse the unchanged conservative allowance and expiry, even without an LLM call.
    await reserve(blobLedger, { id, runId: input.runId, actor, kind: "profile", at: Date.now(), status: "reserved", tavilyReservedCredits: 1 }); reserved = true;
    if(companySource){
      const page=await extractWebsite(companySource,request.signal);
      const contacts=publishedEmails(page.content,companySource,domain).map(contact=>({...contact,sourceUrl:companySource}));
      await settle(blobLedger,id,{status:"completed",tavilyRequestId:page.requestId,tavilyReportedCredits:page.credits,estimatedCostMicros:0});
      return Response.json({companyName:input.companyName,companyWebsite,contacts,searchedAt:new Date().toISOString(),requestId:page.requestId ?? "",sources:[{url:companySource,title:`${input.companyName} company profile`}]},{headers});
    }
    const safeName = input.companyName.replace(/["\r\n]/g, " ");
    const result = await searchCompanies(`site:${domain} "${safeName}" contact email`, request.signal);
    const contacts = result.sources.filter(s => {const host=new URL(s.url).hostname.replace(/^www\./, "");return host===domain || host.endsWith(`.${domain}`);}).flatMap(s => (s.publishedEmails ?? []).map(c => ({ ...c, sourceUrl: s.url }))).filter((c,index,all)=>all.findIndex(a=>a.email===c.email)===index).slice(0,5);
    await settle(blobLedger, id, { status: "completed", tavilyRequestId: result.requestId, tavilyReportedCredits: result.credits, estimatedCostMicros: 0 });
    return Response.json({ companyName: input.companyName, companyWebsite, contacts, searchedAt: result.searchedAt, requestId: result.requestId, sources: result.sources.map(s => ({url:s.url,title:s.title})) }, {headers});
  } catch (error) {
    if (reserved && id) await settle(blobLedger, id, {status:"unknown"}).catch(()=>{});
    const gate = error instanceof GateError ? error : new GateError("research_failed", 502, "Contact research failed. No automatic retry or email was sent.");
    return Response.json({error:gate.message}, {status:gate.status,headers});
  }
}
