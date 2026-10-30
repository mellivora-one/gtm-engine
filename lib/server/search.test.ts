import test from "node:test";
import assert from "node:assert/strict";
import { searchCompanies } from "./search.ts";
import { groundLeads, discoveryContext, defaultDiscoveryQuery, resolvedDiscoveryQuery, type DiscoveryResult, type SearchSource } from "../discovery.ts";
import { emptyWorkspace, restoreWorkspace, exportPlan, currentDiscovery } from "../model.ts";

const source: SearchSource = { id: "S1", url: "https://acme.example.com/", title: "Acme company", excerpt: "Acme builds workflow software for small business teams." };
const lead = { companyName: "Acme", sourceIds: ["S1"], evidenceQuote: source.excerpt, fit: "possible" as const, fitReason: "Potential workflow fit; buying intent unknown.", gaps: ["Employee count unverified"] };

test("basic search is bounded, sanitizes links, and never auto-retries an empty/error response", async () => {
  const prior = process.env.TAVILY_API_KEY; process.env.TAVILY_API_KEY = "test-only";
  let calls = 0;
  const mocked = (body: unknown, status = 200): typeof fetch => async (url, init) => {
    calls++; assert.equal(url, "https://api.tavily.com/search");
    const input = JSON.parse(String(init?.body));
    assert.equal(input.search_depth, "basic"); assert.equal(input.auto_parameters, false);
    assert.equal(input.max_results, 20); assert.equal(input.include_raw_content, "text");
    assert.equal(input.include_answer, false); assert.equal(init?.redirect, "error");
    return Response.json(body, { status });
  };
  try {
    const r = await searchCompanies("workflow software companies", new AbortController().signal, mocked({ results: [
      { url: "javascript:alert(1)", content: source.excerpt }, { url: "http://127.0.0.1/", content: source.excerpt },
      { url: "https://www.ycombinator.com/companies/acme", title: source.title, content: source.excerpt, raw_content: "Active Founders\nA founder.\nTeam Size:2\nStatus:\nInactive" }, { url: "https://www.ycombinator.com/companies/acme", content: source.excerpt },
    ], request_id: "receipt", usage: { credits: 1 } }));
    assert.equal(r.sources.length, 1); assert.equal(r.sources[0].operatingStatus, "inactive"); assert.equal(r.sources[0].teamSize, 2); assert.equal(r.requestId, "receipt"); assert.equal(r.credits, 1);
    await assert.rejects(searchCompanies("workflow software companies", new AbortController().signal, mocked({ results: [] })), /No usable public sources/);
    await assert.rejects(searchCompanies("workflow software companies", new AbortController().signal, mocked({}, 429)), /could not complete/);
    assert.equal(calls, 3);
  } finally { if (prior === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = prior; }
});

test("only grounded, distinct company names and exact quotes survive; missing data is not fabricated", () => {
  const result = groundLeads({ leads: [lead, lead, { ...lead, companyName: "Invented" }, { ...lead, sourceIds: ["S99"] }, { ...lead, evidenceQuote: "Acme has 40 employees and is buying now." }], limitations: [] }, [source], "OurProduct", 5);
  assert.deepEqual(result.leads, [lead]);
  assert.equal(groundLeads({ leads: [lead], limitations: [] }, [{ ...source, teamSize: 5 }], "OurProduct", 5, "11–50 employees").leads.length, 0);
  assert.equal(groundLeads({ leads: [lead], limitations: [] }, [{ ...source, operatingStatus: "inactive" }], "OurProduct", 5).leads.length, 0);
  assert.equal(groundLeads({ leads: [lead], limitations: [] }, [source], "Acme", 5).leads.length, 0);
});

test("research survives refresh/export with full criteria and becomes stale after criteria changes", () => {
  const state = structuredClone(emptyWorkspace);
  state.product = { ...state.product, name: "OurProduct", description: "Software for workflow teams." };
  state.profile = { ...state.profile, industry: "Software", roles: ["Founder"], signals: ["A".repeat(130)] };
  state.drafted = state.productConfirmed = state.customersConfirmed = true;
  state.search = { count: "5", focus: "Product fit", query: "workflow software companies" };
  state.discoveryContext = discoveryContext(state.product, state.profile, state.search);
  const result: DiscoveryResult = { leads: [lead], sources: [source], limitations: [], query: state.search.query!, searchedAt: new Date().toISOString(), searchRequestId: "receipt", meta: { runId: crypto.randomUUID(), requestId: crypto.randomUUID(), responseId: "model-receipt", model: "gpt-6.1-sol", generatedAt: new Date().toISOString() } };
  state.discoveryAnalysis = result;
  const restored = restoreWorkspace(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.profile.signals[0].length, 130);
  assert.deepEqual(currentDiscovery(restored), result);
  assert.equal(exportPlan(restored).prospectDiscoveryPerformed, true);
  restored.profile.industry = "Healthcare";
  assert.equal(currentDiscovery(restored), undefined);
  assert.equal(exportPlan(restored).companyResearch, undefined);
});

test("profile queries remove narrative boilerplate across industries without guessing a startup vertical",()=>{
 const q=(industry:string,location="",focus="Product fit")=>defaultDiscoveryQuery({industry,location},focus);
 assert.equal(q("Suggested: B2B companies that use professional events for sales; no specific vertical established."),"B2B companies directory");
 assert.equal(q("Suggested: insurance damage repair contractors that need a CRM","United States"),"insurance damage repair contractors United States");
 assert.equal(q("Law firms","London"),"Law firms London");
 assert.equal(q("Medical device manufacturers","Germany"),"Medical device manufacturers Germany");
 assert.equal(q("B2B SaaS","Any location"),"B2B SaaS companies");
 assert.equal(q("No specific vertical established"),"companies directory");
 assert.ok(q("Restaurants","San Francisco","Recent buying signals").includes("company news"));
 const profile={industry:"Law firms",location:"London"};
 assert.equal(resolvedDiscoveryQuery(profile,{focus:"Product fit",query:"site:custom.example law practices",queryMode:"manual"}),"site:custom.example law practices");
 assert.equal(resolvedDiscoveryQuery(profile,{focus:"Product fit",query:"Suggested: B2B companies that use events startup companies products customers"}),"Law firms London");
 assert.equal(resolvedDiscoveryQuery(profile,{focus:"Product fit",query:"",queryMode:"manual"}),"");
 assert.equal(resolvedDiscoveryQuery({...profile,location:"Paris"},{focus:"Product fit",query:"Law firms London",queryMode:"auto"}),"Law firms Paris");
});
