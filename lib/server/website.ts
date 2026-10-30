import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { normalizeUrl } from "../model.ts";
import { GateError } from "./budget.ts";

const blocked = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["192.88.99.0", 24],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(ip, bits, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");

export function publicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4")
    : family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}
export function websiteUrl(input: string): string {
  let url: URL;
  try { url = new URL(normalizeUrl(input)); }
  catch { throw new GateError("invalid_url", 400, "Enter a public website URL, such as https://example.com."); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (/(^|\.)linkedin\.com$/.test(hostname))
    throw new GateError("linkedin_not_supported", 400,
      "LinkedIn profiles are not scraped. Replace this link with your product website, or remove it and describe the project you want to use.");
  if (url.port || isIP(hostname.replace(/^\[|\]$/g, "")) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(hostname))
    throw new GateError("private_url", 400, "Use a public website with a standard HTTP or HTTPS port, not a local or private address.");
  url.hostname = hostname;
  url.hash = "";
  return url.href;
}
export async function validateWebsite(input: string): Promise<string> {
  const url = websiteUrl(input);
  let addresses;
  try {
    addresses = await Promise.race([
      lookup(new URL(url).hostname, { all: true }),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error("DNS timeout")), 3000);
        timer.unref();
      }),
    ]);
  } catch {
    throw new GateError("website_unresolved", 400, "That website could not be resolved. Check the URL or continue with a description.");
  }
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
    throw new GateError("private_url", 400, "Only publicly accessible websites can be read.");
  return url;
}

export async function extractWebsite(url: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  if (!process.env.TAVILY_API_KEY)
    throw new GateError("tavily_not_configured", 503, "Website reading is not configured. Remove the link to use a description, or continue manually.");
  let response: Response;
  try {
    // Fixed provider endpoint: never fetch arbitrary websites with app credentials.
    // One URL, basic extraction, no crawling, retries, login or access-control bypass.
    response = await fetcher("https://api.tavily.com/extract", {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [url], extract_depth: "basic", format: "text", timeout: 10, include_usage: true, include_images: false }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(14_000)]),
    });
  } catch {
    throw new GateError("website_unavailable", 502, "Website reading timed out or failed. No automatic retry was made. Remove the link to use your description, or continue manually.");
  }
  if (!response.ok || !response.body)
    throw new GateError("website_unavailable", 502, "Tavily could not read that website. Check the link or remove it to use your description. No automatic retry was made.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 1_000_000) {
      await reader.cancel();
      throw new GateError("website_too_large", 502, "The website response is too large. Try a smaller product page or use a description.");
    }
    chunks.push(value);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new GateError("website_unavailable", 502, "Tavily returned an unreadable response. Your input is preserved."); }
  const result = Array.isArray(data.results) ? data.results.find((item: {url?: unknown}) => item.url === url) : undefined;
  const content = typeof result?.raw_content === "string" ? result.raw_content.trim() : "";
  if (content.length < 80)
    throw new GateError("website_empty", 422, "No useful website text was returned. It may require a login or block extraction. Paste a product description instead; OpenAI was not called.");
  return {
    content: Buffer.from(content).subarray(0, 8000).toString("utf8"),
    truncated: Buffer.byteLength(content) > 8000,
    requestId: typeof data.request_id === "string" ? data.request_id.slice(0, 200) : undefined,
    credits: typeof data.usage?.credits === "number" && data.usage.credits >= 0 ? data.usage.credits : undefined,
  };
}
