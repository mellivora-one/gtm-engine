import test from "node:test";
import assert from "node:assert/strict";
import { publishedEmails, relationshipGraph } from "./prospecting.ts";
import { meterResearch, usageForSearch } from "./server/flexprice.ts";
import { validatePostmark } from "./server/postmark.ts";
import { researchContacts } from "./server/contacts.ts";

test("published contacts require an exact corporate domain and preserve publication evidence", () => {
 const text="Contact Acme at hello@acme.com. Also person@gmail.com, stolen@notacme.com, and noreply@acme.com.";
 const contacts=publishedEmails(text,"https://acme.com/contact");
 assert.equal(contacts.length,1);assert.equal(contacts[0].email,"hello@acme.com");assert.ok(contacts[0].quote.includes(contacts[0].email));
 assert.equal(publishedEmails("founder@acme.com team@ycombinator.com","https://ycombinator.com/companies/acme").length,0);
 assert.deepEqual(publishedEmails("founder@acme.com team@ycombinator.com","https://ycombinator.com/companies/acme","acme.com").map(c=>c.email),["founder@acme.com"]);
 const graph=relationshipGraph("Our product",{leads:[{companyName:"Acme",sourceIds:["S1"],fit:"possible",fitReason:"Potential fit",evidenceQuote:"Acme builds software",gaps:[]}],sources:[{id:"S1",url:"https://acme.com",title:"Acme",excerpt:"Acme builds software"}],limitations:[],meta:{runId:crypto.randomUUID(),requestId:crypto.randomUUID(),responseId:"response",model:"gpt-6.1-sol",generatedAt:new Date().toISOString()},query:"Acme",searchedAt:new Date().toISOString(),searchRequestId:"test"},[]);
 assert.equal(graph.edges.length,2);assert.ok(graph.edges.some(e=>e.type==="supported_by"));
});
test("contact route rejects cross-origin and invalid requests before spending", async()=>{
 assert.equal((await researchContacts(new Request("https://app.example/api/research/contacts",{method:"POST",headers:{origin:"https://evil.example"},body:"{}"}))).status,403);
 assert.equal((await researchContacts(new Request("https://app.example/api/research/contacts",{method:"POST",headers:{origin:"https://app.example","Content-Type":"application/json"},body:"{}"}))).status,400);
});

test("Postmark API test rejects unapproved drafts and foreign origins before any provider call",async()=>{
 const url="https://app.example/api/outreach/validate";
 assert.equal((await validatePostmark(new Request(url,{method:"POST",headers:{origin:"https://evil.example"},body:"{}"}))).status,403);
 assert.equal((await validatePostmark(new Request(url,{method:"POST",headers:{origin:"https://app.example","Content-Type":"application/json"},body:JSON.stringify({runId:crypto.randomUUID(),requestId:crypto.randomUUID(),approved:false,subject:"Test",body:"Test"})}))).status,400);
});

test("real demo sending rejects a wrong access code before spending",async()=>{
 const names=["OPENAI_API_KEY","BLOB_READ_WRITE_TOKEN","POSTMARK_SERVER_TOKEN","DEMO_SEND_CODE","POSTMARK_FROM_EMAIL","DEMO_EMAIL_TO"];const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{Object.assign(process.env,{OPENAI_API_KEY:"test",BLOB_READ_WRITE_TOKEN:"test",POSTMARK_SERVER_TOKEN:"test",DEMO_SEND_CODE:"private-test-code",POSTMARK_FROM_EMAIL:"sender@example.com",DEMO_EMAIL_TO:"owner@example.com"});
 const response=await validatePostmark(new Request("https://app.example/api/outreach/demo",{method:"POST",headers:{origin:"https://app.example","Content-Type":"application/json"},body:JSON.stringify({runId:crypto.randomUUID(),requestId:crypto.randomUUID(),approved:true,accessCode:"wrong-code",subject:"Demo",body:"Demo"})}),true);assert.equal(response.status,403);
 }finally{for(const k of names){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});

test("usage recording rejects foreign origins and malformed runs before external access",async()=>{
 const url="https://app.example/api/usage/flexprice";assert.equal((await meterResearch(new Request(url,{method:"POST",headers:{origin:"https://evil.example"},body:"{}"}))).status,403);
 assert.equal((await meterResearch(new Request(url,{method:"POST",headers:{origin:"https://app.example","Content-Type":"application/json"},body:"{}"}))).status,400);
});

test("usage identity follows the exact search and reuses legacy receipts without resending",()=>{
 const run=crypto.randomUUID(),first=crypto.randomUUID(),second=crypto.randomUUID();
 const base={runId:run,actor:"test",kind:"profile" as const,at:1,status:"completed" as const};
 const ledger={version:2 as const,startsAt:0,endsAt:100,budgetMicros:40000000 as const,reservationMicros:100000 as const,reservations:[{...base,id:`${run}:discover:${first}`,inputTokens:10},{...base,id:`${run}:discover:${second}`,inputTokens:20},{...base,id:`${run}:flexprice:company-discovery`}]};
 assert.equal(usageForSearch(ledger,run,first).alreadyRecorded,true);
 const next=usageForSearch(ledger,run,second);assert.equal(next.alreadyRecorded,false);assert.equal(next.completed.inputTokens,20);assert.equal(next.eventId,`gtm-discovery-${second}`);
 assert.throws(()=>usageForSearch(ledger,run,crypto.randomUUID()),/exact completed search/);
 ledger.reservations.push({...base,id:next.id});assert.equal(usageForSearch(ledger,run,second).alreadyRecorded,true);
});
