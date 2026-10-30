import { handleAnalysis } from "@/lib/server/ai";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request) {
  return handleAnalysis(request, "brief");
}
