import { validatePostmark } from "@/lib/server/postmark";
export const runtime="nodejs";
export const maxDuration=45;
export async function POST(request:Request){return validatePostmark(request);}
