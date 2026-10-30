import {
  briefResultSchema,
  customerResultSchema,
  type BriefResult,
  type CustomerResult,
} from "./ai-schema.ts";

export type Product = {
  name: string;
  description: string;
  audience: string;
  benefit: string;
  website: string;
  pricing: string;
  customers: string;
  features: string;
  constraints: string;
};
export type Profile = {
  industry: string;
  size: string;
  location: string;
  roles: string[];
  signals: string[];
  exclusions: string;
};
export type Workspace = {
  version: 1;
  intake: { description: string; url: string };
  product: Product;
  profile: Profile;
  source: "manual" | "example" | "ai";
  runId?: string;
  briefAnalysis?: BriefResult;
  customerAnalysis?: CustomerResult;
  drafted: boolean;
  productConfirmed: boolean;
  customersConfirmed: boolean;
  search: { count: string; focus: string };
};
export const STORAGE_KEY = "gtm-engine:workspace:v1";
export const emptyWorkspace: Workspace = {
  version: 1,
  intake: { description: "", url: "" },
  product: {
    name: "",
    description: "",
    audience: "",
    benefit: "",
    website: "",
    pricing: "",
    customers: "",
    features: "",
    constraints: "",
  },
  profile: {
    industry: "",
    size: "",
    location: "",
    roles: [],
    signals: [],
    exclusions: "",
  },
  source: "manual",
  drafted: false,
  productConfirmed: false,
  customersConfirmed: false,
  search: { count: "10", focus: "Product fit and buying signals" },
};
export const exampleWorkspace: Workspace = {
  ...emptyWorkspace,
  intake: {
    description:
      "AI Support Assistant helps B2B SaaS support teams answer repetitive customer questions. It drafts answers for agents to review before sending.",
    url: "",
  },
  product: {
    name: "AI Support Assistant",
    description: "Helps support teams answer recurring customer questions.",
    audience: "B2B SaaS support teams",
    benefit: "Less repetitive support work.",
    website: "",
    pricing: "",
    customers: "",
    features: "Draft answers to recurring customer questions for agent review.",
    constraints: "Human approval before sending responses.",
  },
  profile: {
    industry: "B2B SaaS",
    size: "",
    location: "",
    roles: ["Head of Support", "VP Customer Success"],
    signals: [],
    exclusions: "",
  },
  source: "example",
  drafted: true,
};

export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) return "";
  const url = new URL(
    /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
  );
  if (
    !["https:", "http:"].includes(url.protocol) ||
    !url.hostname.includes(".") ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Enter a valid website or LinkedIn URL, such as https://example.com.",
    );
  }
  return url.href;
}

export function isPersonalLinkedIn(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      /(^|\.)linkedin\.com$/i.test(parsed.hostname) &&
      parsed.pathname.startsWith("/in/")
    );
  } catch {
    return false;
  }
}

export function draftWorkspace(state: Workspace): Workspace {
  const url = normalizeUrl(state.intake.url);
  const description = state.intake.description.trim();
  if (!description && !url)
    throw new Error("Add a product description or a link to continue.");
  if (
    state.source === "example" &&
    description === exampleWorkspace.intake.description &&
    !url
  ) {
    return {
      ...state,
      drafted: true,
      productConfirmed: false,
      customersConfirmed: false,
    };
  }
  return {
    ...state,
    intake: { description, url },
    source: "manual",
    drafted: true,
    product: {
      ...emptyWorkspace.product,
      name: "",
      description,
      website: isPersonalLinkedIn(url) ? "" : url,
    },
    profile: { ...emptyWorkspace.profile },
    productConfirmed: false,
    customersConfirmed: false,
  };
}

// Treat browser storage as untrusted and rebuild only the expected fields.
export function restoreWorkspace(value: unknown): Workspace {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1
  )
    return structuredClone(emptyWorkspace);
  const raw = value as Record<string, unknown>;
  const record = (item: unknown) =>
    item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const text = (item: unknown) =>
    typeof item === "string" ? item.slice(0, 8000) : "";
  const list = (item: unknown) =>
    Array.isArray(item)
      ? item
          .filter((entry): entry is string => typeof entry === "string")
          .slice(0, 12)
          .map((entry) => entry.slice(0, 100))
      : [];
  const intake = record(raw.intake),
    product = record(raw.product),
    profile = record(raw.profile),
    search = record(raw.search);
  const restored: Workspace = {
    version: 1,
    intake: { description: text(intake.description), url: text(intake.url) },
    product: {
      name: text(product.name),
      description: text(product.description),
      audience: text(product.audience),
      benefit: text(product.benefit),
      website: text(product.website),
      pricing: text(product.pricing),
      customers: text(product.customers),
      features: text(product.features),
      constraints: text(product.constraints),
    },
    profile: {
      industry: text(profile.industry),
      size: text(profile.size),
      location: text(profile.location),
      roles: list(profile.roles),
      signals: list(profile.signals),
      exclusions: text(profile.exclusions),
    },
    source:
      raw.source === "ai"
        ? "ai"
        : raw.source === "example"
          ? "example"
          : "manual",
    runId:
      typeof raw.runId === "string" && /^[a-f0-9-]{36}$/i.test(raw.runId)
        ? raw.runId
        : undefined,
    briefAnalysis: briefResultSchema.safeParse(raw.briefAnalysis).data,
    customerAnalysis: customerResultSchema.safeParse(raw.customerAnalysis).data,
    drafted: raw.drafted === true,
    productConfirmed: raw.productConfirmed === true,
    customersConfirmed: raw.customersConfirmed === true,
    search: {
      count: ["5", "10", "25"].includes(text(search.count))
        ? text(search.count)
        : "10",
      focus: [
        "Product fit and buying signals",
        "Product fit",
        "Recent buying signals",
      ].includes(text(search.focus))
        ? text(search.focus)
        : "Product fit and buying signals",
    },
  };
  restored.productConfirmed =
    restored.drafted &&
    !!restored.product.name.trim() &&
    !!restored.product.description.trim() &&
    restored.productConfirmed;
  restored.customersConfirmed =
    restored.productConfirmed &&
    !!restored.profile.industry.trim() &&
    restored.profile.roles.length > 0 &&
    restored.customersConfirmed;
  return restored;
}

export function exportPlan(state: Workspace) {
  return {
    schemaVersion: 1,
    mode: state.briefAnalysis
      ? "ai-assisted-search-plan"
      : "manual-search-plan",
    generatedAt: new Date().toISOString(),
    product: state.product,
    idealCustomers: state.profile,
    discovery: state.search,
    approvals: {
      product: state.productConfirmed,
      customers: state.customersConfirmed,
    },
    liveResearchPerformed: !!state.briefAnalysis?.sources?.length,
    prospectDiscoveryPerformed: false,
    enrichmentPerformed: false,
    messagesSent: 0,
    ai: { brief: state.briefAnalysis, customerProfile: state.customerAnalysis },
  };
}
