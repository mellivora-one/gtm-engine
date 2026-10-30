import { blobLedger } from "@/lib/server/blob-ledger";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { ledger } = await blobLedger.read();
    return Response.json(
      {
        configured: !!process.env.OPENAI_API_KEY,
        websiteConfigured: !!process.env.TAVILY_API_KEY,
        tavilyCreditLimit: 200,
        tavilyReservedCredits: ledger.reservations.reduce((sum, item) => sum + (item.tavilyReservedCredits ?? 0), 0),
        active:
          !!process.env.OPENAI_API_KEY &&
          Date.now() >= ledger.startsAt &&
          Date.now() < ledger.endsAt &&
          ledger.reservations.length < 400,
        endsAt: new Date(ledger.endsAt).toISOString(),
        reservedUsd: ledger.reservations.length / 10,
        budgetUsd: 40,
        reservationPerRequestUsd: 0.1,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { configured: false, active: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
