import { z } from "zod";
import { createHmac } from "node:crypto";
import { GateError, reserve, settle } from "./budget.ts";
import { blobLedger } from "./blob-ledger.ts";
const schema = z.object({ runId:z.uuid(), requestId:z.uuid(), approved:z.literal(true), subject:z.string().trim().min(1).max(200), body:z.string().trim().min(1).max(4000) });
export async function validatePostmark(request: Request) {
  const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
  let id: string | undefined;let reserved=false;
  try {
    if(request.headers.get("origin")!==new URL(request.url).origin)throw new GateError("origin_rejected",403,"Use the GTM Engine website.");
    if(!request.headers.get("content-type")?.startsWith("application/json") || !request.body)throw new GateError("invalid_input",400,"Approve the draft first.");
    const reader=request.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>18000){await reader.cancel();throw new GateError("too_large",413,"Draft too large.");}chunks.push(value);}
    const input=schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if(!input.success)throw new GateError("approval_required",400,"Approve the current draft before API validation.");
    if(!process.env.OPENAI_API_KEY || !process.env.BLOB_READ_WRITE_TOKEN)throw new GateError("not_configured",503,"The demo guard is unavailable.");
    const ip=request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || (process.env.NODE_ENV==="development"?"local-development":"");
    if(!ip)throw new GateError("client_unavailable",503,"The request could not be safely rate limited.");
    const actor=createHmac("sha256",process.env.OPENAI_API_KEY).update(ip).digest("hex").slice(0,32);
    id=`${input.data.runId}:postmark-test:${input.data.requestId}`;
    await reserve(blobLedger,{id,runId:input.data.runId,actor,kind:"profile",at:Date.now(),status:"reserved"});reserved=true;
    // Hard-coded official test sentinel, never a production token. Override all
    // recipient fields; this endpoint cannot deliver to a lead or any inbox.
    const response=await fetch("https://api.postmarkapp.com/email",{method:"POST",redirect:"error",cache:"no-store",headers:{"Content-Type":"application/json",Accept:"application/json","X-Postmark-Server-Token":"POSTMARK_API_TEST"},body:JSON.stringify({From:"GTM Engine Demo <demo@boriskov.com>",To:"test@blackhole.postmarkapp.com",Subject:input.data.subject,TextBody:input.data.body,TrackOpens:false,TrackLinks:"None"}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)])});
    const result=await response.json();
    if(!response.ok || result.ErrorCode!==0 || typeof result.MessageID!=="string")throw new GateError("postmark_failed",502,"Postmark did not validate this message. No email was delivered and no retry was made.");
    await settle(blobLedger,id,{status:"completed",estimatedCostMicros:0});
    return Response.json({mode:"api-test-no-delivery",messageId:result.MessageID,validatedAt:new Date().toISOString(),delivered:false,runId:input.data.runId},{headers});
  }catch(error){
    if(reserved&&id)await settle(blobLedger,id,{status:"unknown"}).catch(()=>{});
    const gate=error instanceof GateError?error:new GateError("validation_failed",502,"Postmark validation failed. No email was delivered and no retry was made.");
    return Response.json({error:gate.message},{status:gate.status,headers});
  }
}
