import { z } from "zod";
import { createHmac } from "node:crypto";
import { blobLedger } from "./blob-ledger.ts";
import { GateError, reserve, settle, type Ledger } from "./budget.ts";
const schema=z.object({runId:z.uuid(),requestId:z.uuid(),discoveryRequestId:z.uuid()});
export function usageForSearch(ledger:Ledger, runId:string, discoveryRequestId:string){
 const completed=ledger.reservations.find(r=>r.id===`${runId}:discover:${discoveryRequestId}` && r.status==="completed");
 if(!completed)throw new GateError("run_not_completed",400,"Only this exact completed search can be metered.");
 const first=ledger.reservations.find(r=>r.runId===runId && r.id.includes(":discover:") && r.status==="completed");
 const legacy=ledger.reservations.find(r=>r.id===`${runId}:flexprice:company-discovery`);
 const legacyApplies=!!legacy && first?.id===completed.id;
 const id=legacyApplies?legacy!.id:`${runId}:flexprice:${discoveryRequestId}`;
 const eventId=`gtm-discovery-${legacyApplies?runId:discoveryRequestId}`;
 const prior=ledger.reservations.find(r=>r.id===id);
 if(prior && prior.status!=="completed")throw new GateError("metering_pending",409,"This search has a previous metering attempt with an unknown outcome. No event was resent.");
 return {completed,id,eventId,alreadyRecorded:prior?.status==="completed"};
}
export async function meterResearch(request:Request){
 const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};let id:string|undefined;let reserved=false;
 try{
  if(request.headers.get("origin")!==new URL(request.url).origin)throw new GateError("origin_rejected",403,"Use the GTM Engine website.");
  if(!request.headers.get("content-type")?.startsWith("application/json") || !request.body)throw new GateError("invalid_input",400,"Select a completed research run.");
  const reader=request.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1000){await reader.cancel();throw new GateError("too_large",413,"Request too large.");}chunks.push(value);}
  const input=schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));if(!input.success)throw new GateError("invalid_input",400,"Select a valid research run.");
  if(!process.env.FLEXPRICE_API_KEY || process.env.FLEXPRICE_API_URL!=="https://us.api.flexprice.io/v1" || !process.env.OPENAI_API_KEY || !process.env.BLOB_READ_WRITE_TOKEN)throw new GateError("not_configured",503,"Flexprice Sandbox metering is not configured.");
  const {ledger}=await blobLedger.read();
  const usage=usageForSearch(ledger,input.data.runId,input.data.discoveryRequestId);
  const completed=usage.completed;
  const result=(eventId:string)=>({eventId,eventName:"company_discovery_completed",environment:"Sandbox",acceptedAt:new Date().toISOString(),status:"accepted",billingEnabled:false,runId:input.data.runId,discoveryRequestId:input.data.discoveryRequestId});
  if(usage.alreadyRecorded)return Response.json(result(usage.eventId),{headers});
  const ip=request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || (process.env.NODE_ENV==="development"?"local-development":"");if(!ip)throw new GateError("client_unavailable",503,"The request could not be safely rate limited.");
  const actor=createHmac("sha256",process.env.OPENAI_API_KEY).update(ip).digest("hex").slice(0,32);
  id=usage.id;
  await reserve(blobLedger,{id,runId:input.data.runId,actor,kind:"profile",at:Date.now(),status:"reserved"});reserved=true;
  const eventId=usage.eventId;
  const response=await fetch("https://us.api.flexprice.io/v1/events",{method:"POST",redirect:"error",cache:"no-store",headers:{"Content-Type":"application/json","x-api-key":process.env.FLEXPRICE_API_KEY},body:JSON.stringify({event_id:eventId,event_name:"company_discovery_completed",external_customer_id:"gtm-engine-hackathon-demo",timestamp:new Date().toISOString(),source:"gtm-engine",properties:{run_id:input.data.runId,search_request_id:input.data.discoveryRequestId,quantity:"1",input_tokens:String(completed.inputTokens ?? 0),output_tokens:String(completed.outputTokens ?? 0)}}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(10000)])});
  if(!response.ok)throw new GateError("metering_failed",502,"Flexprice did not confirm acceptance. No billing was enabled; this attempt is locked for inspection.");
  const receipt=await response.json().catch(()=>({}));
  await settle(blobLedger,id,{status:"completed",estimatedCostMicros:0});
  return Response.json({eventId:typeof receipt.event_id==="string"?receipt.event_id:eventId,submittedEventId:eventId,eventName:"company_discovery_completed",environment:"Sandbox",acceptedAt:new Date().toISOString(),status:"accepted",billingEnabled:false,runId:input.data.runId,discoveryRequestId:input.data.discoveryRequestId},{headers});
 }catch(error){if(reserved&&id)await settle(blobLedger,id,{status:"unknown"}).catch(()=>{});const gate=error instanceof GateError?error:new GateError("metering_failed",502,"Flexprice acceptance is unknown. No automatic retry or billing action was made.");return Response.json({error:gate.message},{status:gate.status,headers});}
}
