"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  draftWorkspace,
  emptyWorkspace,
  exampleWorkspace,
  exportPlan,
  isPersonalLinkedIn,
  normalizeUrl,
  type Product,
  type Profile,
} from "@/lib/model";
import { useWorkspace } from "./workspace";
import { Icon } from "./icons";
import { WorkspaceSkeleton } from "./workspace-skeleton";
import {
  briefResultSchema,
  customerResultSchema,
  type BriefResult,
  type CustomerResult,
} from "@/lib/ai-schema";

import { discoveryResultSchema, defaultDiscoveryQuery, discoveryContext } from "@/lib/discovery";

type Page = "intake" | "brief" | "customers" | "discover";
const steps = ["Product brief", "Ideal customers", "Discover leads"];

function AnalysisNotes({
  analysis,
}: {
  analysis: BriefResult | CustomerResult | undefined;
}) {
  if (!analysis) return null;
  return (
    <div className="analysis-notes">
      <span className="status">
        <Icon name="spark" size={14} />
        AI-generated · Review before confirming
      </span>
      {analysis.questions.length > 0 && (
        <div className="clarifications">
          <h3>Worth clarifying</h3>
          <ul>
            {analysis.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
          <p className="hint">
            Add the answers to the editable fields. Unknown details are not
            filled in as facts.
          </p>
        </div>
      )}
      {analysis.assumptions.length > 0 && (
        <>
          <h3>Assumptions to review</h3>
          <ul>
            {analysis.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </>
      )}
      {"sources" in analysis && analysis.sources && analysis.sources.length > 0 && (
        <section className="source-evidence" aria-label="Website evidence">
          <h3>Website evidence</h3>
          {analysis.sources.map((source) => (
            <div key={source.id}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">[{source.id}] {source.url}</a>
              <p className="hint">{source.provider} · Retrieved {new Date(source.retrievedAt).toLocaleString()} · Only this page was read. Claims need your review.</p>
              <details><summary>View extracted excerpt</summary><p className="source-excerpt">{source.excerpt}</p>
                <p className="hint">Excerpt only.{source.truncated ? " Page content was shortened for analysis." : ""}</p>
              </details>
            </div>
          ))}
        </section>
      )}
      <details className="analysis-provenance">
        <summary>Field origins and model confidence</summary>
        <p className="hint">
          Estimates apply to the original AI draft, not your later edits. They
          are not calibrated or independently verified. Website claims are not independently verified.
        </p>
        <ul>
          {analysis.insights.map((insight, index) => (
            <li key={`${insight.field}-${index}`}>
              <strong>{insight.field}</strong>
              <span className="insight-origin">
                {insight.origin === "stated"
                  ? "From your input"
                  : insight.origin === "source"
                    ? "Website claim [S1]"
                  : insight.origin === "inferred"
                    ? "AI suggestion"
                    : "Unknown"}{" "}
                · {Math.round(insight.confidence * 100)}%
              </span>
              <p>{insight.explanation}</p>
            </li>
          ))}
        </ul>
      </details>
      <p className="analysis-receipt">
        {analysis.meta.model}
        <br />
        Run: {analysis.meta.runId}
      </p>
    </div>
  );
}

function Status({
  children,
  approved = false,
}: {
  children: ReactNode;
  approved?: boolean;
}) {
  return (
    <span className={`status ${approved ? "approved" : ""}`}>
      {approved ? (
        <Icon name="check" size={14} />
      ) : (
        <span className="status-dot" />
      )}
      {children}
    </span>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Actions({
  back,
  backLabel,
  children,
  note,
}: {
  back?: string;
  backLabel?: string;
  children: ReactNode;
  note: string;
}) {
  return (
    <div className="action-area">
      <div className="actions">
        {back ? (
          <Link href={back} className="button secondary">
            {backLabel}
          </Link>
        ) : (
          <span />
        )}
        {children}
      </div>
      <p className="action-note">{note}</p>
    </div>
  );
}

export function Onboarding({ page }: { page: Page }) {
  const { state, setState, ready, storageAvailable, isNavigating, aiBusy } =
    useWorkspace();
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [showNavigationSkeleton, setShowNavigationSkeleton] = useState(false);
  useEffect(() => {
    if (!isNavigating) {
      setShowNavigationSkeleton(false);
      return;
    }
    // Avoid flashing a placeholder for already-prefetched, instant navigations.
    const timer = setTimeout(() => setShowNavigationSkeleton(true), 140);
    return () => clearTimeout(timer);
  }, [isNavigating]);
  const active = page === "customers" ? 1 : page === "discover" ? 2 : 0;
  const allowed =
    page === "intake" ||
    (page === "brief" && state.drafted) ||
    (page === "customers" && state.productConfirmed) ||
    (page === "discover" && state.customersConfirmed);
  useEffect(() => {
    if (!ready) return;
    if (!allowed) {
      router.replace(
        state.productConfirmed ? "/customers" : state.drafted ? "/brief" : "/",
      );
      return;
    }
  }, [page, ready, allowed, router, state.productConfirmed, state.drafted]);
  useEffect(() => {
    if (ready) titleRef.current?.focus();
  }, [page, ready]);
  const titles = {
    intake: "What are you bringing to market?",
    brief: "Did we understand your product?",
    customers: "Who should we find for you?",
    discover: "Find your first leads",
  };
  const subtitles = {
    intake:
      "Describe your product or share a link. We will help you create a clear product brief.",
    brief: "Review and edit your brief before we define your ideal customers.",
    customers:
      "Start with a clear profile. Choose the customers you want to reach.",
    discover:
      "Search public sources for companies that may fit your confirmed customer profile.",
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link
          href="/"
          className="brand"
          aria-label="GTM Engine home"
          aria-disabled={!!aiBusy}
          onClick={(event) => {
            if (aiBusy) event.preventDefault();
          }}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>GTM</strong> Engine
          </span>
        </Link>
        <nav aria-label="Onboarding progress">
          <ol className="steps">
            {steps.map((label, index) => {
              const done =
                index === 0
                  ? state.productConfirmed
                  : index === 1
                    ? state.customersConfirmed
                    : false;
              const canNavigate =
                index === 0 ||
                (index === 1 && state.productConfirmed) ||
                (index === 2 && state.customersConfirmed);
              const content = (
                <>
                  <span
                    className={`step-number ${done && index !== active ? "done" : ""}`}
                  >
                    {done && index !== active ? (
                      <Icon name="check" size={18} />
                    ) : (
                      `0${index + 1}`
                    )}
                  </span>
                  <span>{label}</span>
                  {index === active && <span className="step-current" />}
                </>
              );
              return (
                <li key={label} className={index === active ? "active" : ""}>
                  {canNavigate && !aiBusy ? (
                    <Link
                      href={
                        index === 0
                          ? state.drafted
                            ? "/brief"
                            : "/"
                          : index === 1
                            ? "/customers"
                            : "/discover"
                      }
                      aria-current={index === active ? "step" : undefined}
                    >
                      {content}
                    </Link>
                  ) : (
                    <span className="step-disabled" aria-disabled="true">
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-caption">FROM PRODUCT TO PIPELINE</span>
          <p>
            A clearer path to your
            <br />
            next customer.
          </p>
          <div className="sidebar-footer">
            <Icon name="shield" size={15} />
            <span>No outreach without approval</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span> {steps[active]}
          </span>
          <div className="topbar-right">
            <span className="prototype-badge">AI-assisted workspace</span>
            <button
              className="text-button reset-button"
              disabled={!!aiBusy}
              onClick={() => setResetOpen(true)}
            >
              Start over
            </button>
          </div>
        </header>
        <main id="main" className={`workspace page-${page}`}>
          <div className="page-heading" key={`heading-${page}`}>
            <p className="eyebrow">
              STEP 0{active + 1} <span>/</span>{" "}
              {page === "brief"
                ? "REVIEW YOUR BRIEF"
                : active === 0
                  ? "START WITH YOUR PRODUCT"
                  : active === 1
                    ? "DEFINE YOUR AUDIENCE"
                    : "SET UP DISCOVERY"}
            </p>
            <h1 ref={titleRef} tabIndex={-1}>
              {titles[page]}
            </h1>
            <p className="subtitle">{subtitles[page]}</p>
          </div>
          {!ready || !allowed || showNavigationSkeleton ? (
            <WorkspaceSkeleton variant={page} />
          ) : (
            <div aria-busy={!!aiBusy}>
              <section
                hidden={!aiBusy}
                className="analysis-loading"
                role="status"
                aria-live="polite"
              >
                <div className="analysis-loading-heading">
                  <span className="analysis-spinner" aria-hidden="true" />
                  <div>
                    <h2>
                      {aiBusy === "brief"
                        ? "Understanding your product"
                        : aiBusy === "profile" ? "Defining your ideal customers" : "Finding company candidates"}
                    </h2>
                    <p>
                      {aiBusy === "discover" ? "Tavily is searching public sources. Sol will assess company fit using only the returned evidence." : aiBusy === "brief" && state.intake.url.trim()
                        ? "Tavily is reading your website, then OpenAI will draft your brief. This can take up to a minute."
                        : "OpenAI is generating a structured draft from your information."}
                    </p>
                  </div>
                </div>
                <WorkspaceSkeleton
                  variant={aiBusy === "discover" ? "discover" : aiBusy === "profile" ? "customers" : "brief"}
                />
              </section>
              <div hidden={!!aiBusy}>
                <div className="page-body" key={page}>
                  {page === "intake" ? (
                    <Intake />
                  ) : page === "brief" ? (
                    <Brief />
                  ) : page === "customers" ? (
                    <Customers />
                  ) : (
                    <Discover />
                  )}
                </div>
              </div>
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              <span className="save-dot" />
              {storageAvailable
                ? "Saved only in this browser"
                : "Browser storage unavailable · Changes last for this visit"}
            </span>
            <span>
              Public-source research via Tavily. No contact enrichment or sending.
            </span>
          </footer>
        </main>
      </div>
      {resetOpen && (
        <ResetDialog
          onClose={() => setResetOpen(false)}
          onConfirm={() => {
            setState(structuredClone(emptyWorkspace));
            setResetOpen(false);
            router.push("/");
          }}
        />
      )}
    </div>
  );
}

function Intake() {
  const { state, setState, navigate, isNavigating, aiBusy, requestAI } =
    useWorkspace();
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const update = (key: "description" | "url", value: string) => {
    setError("");
    setState((previous) => ({
      ...previous,
      intake: { ...previous.intake, [key]: value },
      source: "manual",
      drafted: false,
      productConfirmed: false,
      customersConfirmed: false,
      briefAnalysis: undefined,
      customerAnalysis: undefined,
    }));
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError("");
      const draft = draftWorkspace(state);
      const linkedIn = draft.intake.url && /(^|\.)linkedin\.com$/i.test(new URL(draft.intake.url).hostname.replace(/\.$/, ""));
      if (linkedIn) throw new Error("This link type is not supported. Use a public product website, or remove the link and describe your product.");
      if (!draft.intake.url && draft.intake.description.length < 20)
        throw new Error("Add at least 20 characters describing your product, or enter a public product website.");
      const runId = crypto.randomUUID();
      const result = briefResultSchema.parse(
        await requestAI("brief", {
          description: draft.intake.description,
          url: draft.intake.url,
          runId,
        }),
      );
      setState((previous) => ({
        ...previous,
        intake: draft.intake,
        product: {
          ...result.product,
          website: isPersonalLinkedIn(draft.intake.url) ? "" : draft.intake.url,
        },
        profile: { ...emptyWorkspace.profile },
        source: "ai",
        runId,
        briefAnalysis: result,
        customerAnalysis: undefined,
        drafted: true,
        productConfirmed: false,
        customersConfirmed: false,
      }));
      navigate("/brief");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Please check your input.",
      );
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }
  return (
    <form
      onSubmit={submit}
      className="intake-form"
      data-example={state.source === "example"}
      aria-busy={isNavigating || !!aiBusy}
    >
      <div className="intake-prompt">
        <span className="prompt-icon">
          <Icon name="spark" size={18} />
        </span>
        <span>One description. One link. A starting point.</span>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setState(structuredClone(exampleWorkspace));
            setError("");
          }}
        >
          Try an example <span aria-hidden="true">↗</span>
        </button>
      </div>
      <Field id="description" label="Describe your product">
        <textarea
          id="description"
          name="description"
          maxLength={6000}
          rows={6}
          value={state.intake.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder="What does it do? Who does it help? What problem does it solve?"
          aria-describedby="intake-help"
        />
        <div className="textarea-footer">
          <span>A few sentences are enough.</span>
          <span>
            {state.intake.description.length.toLocaleString()} / 6,000
          </span>
        </div>
      </Field>
      <div className="or-divider">
        <span />
        or add a link
        <span />
      </div>
      <Field
        id="url"
        label="Product website"
        hint="Add a public product website, a description, or both."
      >
        <div className="input-with-icon">
          <Icon name="link" />
          <input
            id="url"
            name="url"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={2000}
            value={state.intake.url}
            onChange={(event) => update("url", event.target.value)}
            placeholder="https://your-product.com"
            aria-describedby="url-hint"
          />
        </div>
      </Field>
      <div className="info-line" id="intake-help">
        <Icon name="info" size={18} />
        <p>We read only the page you provide. Use a product or About page with a clear description of what you offer.</p>
      </div>
      <div className="prototype-note">
        <strong>
          Website links are sent to Tavily for single-page extraction.
        </strong>{" "}
        Your description and extracted text are sent to OpenAI to draft a brief.
        Use public pages only—no private links, credentials, or sensitive personal information.
        You review the sources and confirm the result.
      </div>
      {error && (
        <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      {error && (
        <button
          type="button"
          className="text-button manual-fallback"
          onClick={() => {
            try {
              setState({
                ...draftWorkspace(state),
                source: "manual",
                briefAnalysis: undefined,
                customerAnalysis: undefined,
                runId: undefined,
              });
              navigate("/brief");
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Add a description or link.",
              );
            }
          }}
        >
          Continue manually without AI
        </button>
      )}
      <Actions note="Review and confirm your brief before we find customers.">
        <button
          className="button primary"
          type="submit"
          disabled={isNavigating || !!aiBusy}
        >
          {isNavigating ? (
            <>
              Opening product brief{" "}
              <span className="button-spinner" aria-hidden="true" />
            </>
          ) : (
            <>
              Understand my product <Icon name="arrow" />
            </>
          )}
        </button>
      </Actions>
    </form>
  );
}

function Brief() {
  const { state, setState, navigate, isNavigating, aiBusy, requestAI } =
    useWorkspace();
  const [error, setError] = useState("");
  const personal = isPersonalLinkedIn(state.intake.url);
  const update = (key: keyof Product, value: string) => {
    setError("");
    setState((previous) => ({
      ...previous,
      product: { ...previous.product, [key]: value },
      productConfirmed: false,
      customersConfirmed: false,
      customerAnalysis: undefined,
    }));
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const website = normalizeUrl(state.product.website);
      setError("");
      let customerAnalysis = state.customerAnalysis;
      if (!customerAnalysis) {
        const { website: ignoredWebsite, ...product } = state.product;
        void ignoredWebsite;
        const runId = state.runId ?? crypto.randomUUID();
        customerAnalysis = customerResultSchema.parse(
          await requestAI("profile", { product, runId }),
        );
      }
      setState((previous) => ({
        ...previous,
        product: { ...previous.product, website },
        productConfirmed: true,
        customersConfirmed: false,
        profile: state.customerAnalysis
          ? previous.profile
          : customerAnalysis.profile,
        customerAnalysis,
        runId: customerAnalysis.meta.runId,
      }));
      navigate("/customers");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The customer profile could not be generated.",
      );
    }
  }
  return (
    <form onSubmit={submit} aria-busy={isNavigating || !!aiBusy}>
      <div className="status-row">
        <Status>Draft · Needs your confirmation</Status>
        {state.source === "example" && (
          <span className="subtle-label">Example data</span>
        )}
      </div>
      {personal && (
        <div className="notice">
          <Icon name="info" />
          <p>
            <strong>Add your product details.</strong> This link was not read.
            Enter the product name and a public product website below.
          </p>
        </div>
      )}
      <div className="two-column">
        <section className="form-stack" aria-label="Product brief fields">
          <Field id="product-name" label="Product name">
            <input
              id="product-name"
              name="productName"
              required
              maxLength={120}
              value={state.product.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Give your product a name"
            />
          </Field>
          <Field id="product-description" label="What it does">
            <textarea
              id="product-description"
              name="productDescription"
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              value={state.product.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Explain what the product does."
            />
          </Field>
          <Field
            id="audience"
            label={
              <>
                Who it helps <span className="optional">(optional)</span>
              </>
            }
          >
            <input
              id="audience"
              name="audience"
              maxLength={500}
              value={state.product.audience}
              onChange={(event) => update("audience", event.target.value)}
              placeholder="For example, B2B SaaS support teams"
            />
          </Field>
          <Field
            id="benefit"
            label={
              <>
                Main benefit{" "}
                <span className="optional">
                  {state.source === "example"
                    ? "Example suggestion · please review"
                    : "(optional)"}
                </span>
              </>
            }
          >
            <input
              id="benefit"
              name="benefit"
              maxLength={500}
              value={state.product.benefit}
              onChange={(event) => update("benefit", event.target.value)}
              placeholder="What improves for your customers?"
            />
          </Field>
          <Field
            id="features"
            label={
              <>
                Core features <span className="optional">(optional)</span>
              </>
            }
          >
            <textarea
              id="features"
              name="features"
              rows={3}
              maxLength={1500}
              value={state.product.features}
              onChange={(event) => update("features", event.target.value)}
              placeholder="What capabilities does the product offer?"
            />
          </Field>
          <Field
            id="constraints"
            label={
              <>
                Technical constraints{" "}
                <span className="optional">(optional)</span>
              </>
            }
          >
            <textarea
              id="constraints"
              name="constraints"
              rows={2}
              maxLength={1000}
              value={state.product.constraints}
              onChange={(event) => update("constraints", event.target.value)}
              placeholder="Required integrations, supported environments, or other limits."
            />
          </Field>
          <details className="details">
            <summary>
              <Icon name="chevron" />
              Add a website, pricing, or existing customers{" "}
              <span className="optional">(optional)</span>
            </summary>
            <div className="details-content">
              <Field id="website" label="Product website">
                <input
                  id="website"
                  name="website"
                  type="text"
                  inputMode="url"
                  value={state.product.website}
                  onChange={(event) => update("website", event.target.value)}
                  maxLength={2000}
                  placeholder="https://your-product.com"
                />
              </Field>
              <Field id="pricing" label="Pricing">
                <input
                  id="pricing"
                  name="pricing"
                  value={state.product.pricing}
                  onChange={(event) => update("pricing", event.target.value)}
                  maxLength={500}
                  placeholder="For example, $49 / month"
                />
              </Field>
              <Field id="current-customers" label="Existing customers">
                <input
                  id="current-customers"
                  name="existingCustomers"
                  value={state.product.customers}
                  onChange={(event) => update("customers", event.target.value)}
                  maxLength={500}
                  placeholder="Customer types or examples"
                />
              </Field>
            </div>
          </details>
        </section>
        <aside className="context-panel">
          <div className="panel-heading">
            <Icon name="file" />
            <h2>What we used</h2>
          </div>
          <div className="source-label">
            {state.source === "example"
              ? "Example description"
              : "Your description"}
          </div>
          <blockquote>
            {state.intake.description || (state.briefAnalysis?.sources?.length
              ? "No description provided. This draft uses the website evidence below."
              : "No description provided. Add product details in the brief.")}
          </blockquote>
          <dl>
            <dt>Provided link</dt>
            <dd className="break-word">{state.intake.url || "Not provided"}</dd>
          </dl>
          <hr />
          <h3>You stay in control</h3>
          <p>
            {state.source === "ai"
              ? state.briefAnalysis?.sources?.length
                ? "Tavily retrieved the submitted page. OpenAI used that evidence and any description to draft this brief. Review website claims, inferred suggestions, and missing facts before confirming."
                : "OpenAI drafted this brief from your description. No website was retrieved for this draft. Review the wording and fill in unknown facts."
              : state.source === "example"
                ? "These are sample suggestions, not an AI analysis. Edit every field to make it yours."
                : "Your text is copied into the brief, not analyzed by AI. Links have not been fetched or verified."}
          </p>
          <AnalysisNotes analysis={state.briefAnalysis} />
          <p className="small">
            Only the product name and description are required. Missing details
            can be added later.
          </p>
        </aside>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {error && (
        <button
          type="button"
          className="text-button manual-fallback"
          onClick={() => {
            setState((previous) => ({
              ...previous,
              productConfirmed: true,
              customersConfirmed: false,
              customerAnalysis: undefined,
            }));
            navigate("/customers");
          }}
        >
          Confirm brief and define customers manually
        </button>
      )}
      <Actions
        back="/"
        backLabel="Back to input"
        note="Next: choose your ideal customers. No searches or messages have started."
      >
        <button
          className="button primary"
          type="submit"
          disabled={isNavigating || !!aiBusy}
        >
          {isNavigating ? (
            <>
              Opening customer setup{" "}
              <span className="button-spinner" aria-hidden="true" />
            </>
          ) : (
            <>
              Confirm product brief <Icon name="arrow" />
            </>
          )}
        </button>
      </Actions>
    </form>
  );
}

function TagEditor({
  id,
  label,
  values,
  onChange,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [value, setValue] = useState("");
  function add() {
    const next = value.trim();
    if (
      next &&
      !values.some((item) => item.toLowerCase() === next.toLowerCase()) &&
      values.length < 8
    )
      onChange([...values, next]);
    setValue("");
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="tag-editor">
        {values.map((item) => (
          <span className="tag" key={item}>
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() => onChange(values.filter((value) => value !== item))}
            >
              <Icon name="close" size={14} />
            </button>
          </span>
        ))}
        <div className="tag-input-row">
          <input
            id={id}
            name={id}
            maxLength={100}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={add}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                add();
              }
            }}
            placeholder={
              values.length
                ? "Add another role"
                : "For example, Head of Support"
            }
          />
          <button
            type="button"
            className="icon-button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={add}
            aria-label="Add buyer role"
          >
            <Icon name="plus" size={18} />
          </button>
        </div>
      </div>
      <p className="hint">Type a role and press Enter or + to add it.</p>
    </div>
  );
}

function Customers() {
  const { state, setState, navigate, isNavigating } = useWorkspace();
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setError("");
    setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, [key]: value },
      customersConfirmed: false,
    }));
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.profile.roles.length) {
      setError("Add at least one buyer role before confirming.");
      document.getElementById("buyer-roles")?.focus();
      return;
    }
    setState((previous) => ({ ...previous, customersConfirmed: true }));
    navigate("/discover");
  }
  return (
    <form onSubmit={submit} aria-busy={isNavigating}>
      <div className="product-strip">
        <Icon name="check" size={16} />
        <span>Confirmed product</span>
        <strong>{state.product.name}</strong>
      </div>
      <div className="two-column">
        <section className="form-stack" aria-label="Ideal customer fields">
          <div className="section-title">
            <h2>Target companies</h2>
            <span className="subtle-label">
              {state.source === "example"
                ? "Example suggestions · Review first"
                : state.customerAnalysis
                  ? "AI suggestions · Review first"
                  : "Your preferences"}
            </span>
          </div>
          <Field id="industry" label="Industry">
            <input
              id="industry"
              name="industry"
              required
              maxLength={200}
              list="industries"
              value={state.profile.industry}
              onChange={(event) => update("industry", event.target.value)}
              placeholder="Choose or type an industry"
            />
            <datalist id="industries">
              <option value="B2B SaaS" />
              <option value="E-commerce" />
              <option value="Professional services" />
              <option value="Healthcare technology" />
              <option value="Financial technology" />
              <option value="Manufacturing" />
            </datalist>
          </Field>
          <div className="field-pair">
            <Field id="company-size" label="Company size">
              <select
                id="company-size"
                name="companySize"
                value={state.profile.size}
                onChange={(event) => update("size", event.target.value)}
              >
                <option value="">Any size</option>
                <option>1–10 employees</option>
                <option>11–50 employees</option>
                <option>51–200 employees</option>
                <option>201–1,000 employees</option>
                <option>1,001+ employees</option>
              </select>
            </Field>
            <Field id="location" label="Location">
              <input
                id="location"
                name="location"
                maxLength={200}
                list="locations"
                value={state.profile.location}
                onChange={(event) => update("location", event.target.value)}
                placeholder="Any location"
              />
              <datalist id="locations">
                <option value="United States" />
                <option value="United Kingdom" />
                <option value="Canada" />
                <option value="European Union" />
              </datalist>
            </Field>
          </div>
          <p className="hint close-hint">
            Not sure? Leave company size and location open.
          </p>
          <h2 className="section-gap">People to reach</h2>
          <TagEditor
            id="buyer-roles"
            label="Buyer roles"
            values={state.profile.roles}
            onChange={(values) => update("roles", values)}
          />
          <fieldset className="signals">
            <legend>
              Buying signals <span className="optional">(optional)</span>
            </legend>
            <div className="signal-options">
              {Array.from(
                new Set([
                  ...(state.customerAnalysis?.profile.signals ?? []),
                  ...state.profile.signals,
                  ...(state.source === "example"
                    ? ["Hiring support agents", "Growing support team"]
                    : []),
                ]),
              ).map((signal) => (
                <label
                  key={signal}
                  className={`signal-option ${state.profile.signals.includes(signal) ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={state.profile.signals.includes(signal)}
                    onChange={(event) =>
                      update(
                        "signals",
                        event.target.checked
                          ? [...state.profile.signals, signal]
                          : state.profile.signals.filter(
                              (item) => item !== signal,
                            ),
                      )
                    }
                  />
                  <span>
                    <span className="signal-kicker">
                      {state.customerAnalysis
                        ? "Suggested criterion"
                        : "Example signal"}
                    </span>
                    {signal}
                  </span>
                </label>
              ))}
            </div>
            <p className="hint">
              Select only if relevant. These are criteria, not observed facts.
            </p>
          </fieldset>
          <details className="details">
            <summary>
              <Icon name="chevron" />
              Exclusions and other criteria{" "}
              <span className="optional">(optional)</span>
            </summary>
            <div className="details-content">
              <Field id="exclusions" label="Who should we leave out?">
                <textarea
                  id="exclusions"
                  name="exclusions"
                  rows={3}
                  maxLength={2000}
                  value={state.profile.exclusions}
                  onChange={(event) => update("exclusions", event.target.value)}
                  placeholder="For example, direct competitors or companies outside your service area."
                />
              </Field>
            </div>
          </details>
        </section>
        <aside className="context-panel profile-preview">
          <h2>Your draft customer profile</h2>
          <Status>Not confirmed</Status>
          <p className="profile-sentence">
            {state.profile.industry || "Choose an industry"}
            {state.profile.size
              ? ` companies with ${state.profile.size.toLowerCase()}`
              : " companies of any size"}
            {state.profile.location
              ? ` in ${state.profile.location}`
              : ", in any location"}
            .
          </p>
          <p>
            {state.profile.roles.length
              ? `Reach ${state.profile.roles.join(" and ")}.`
              : "Add the people who would evaluate or buy your product."}
          </p>
          <hr />
          <h3>
            {state.customerAnalysis || state.source === "example"
              ? "Why these suggestions?"
              : "Make this profile yours"}
          </h3>
          <p>
            {state.customerAnalysis
              ? state.customerAnalysis.rationale
              : state.source === "example"
                ? "The sample product helps SaaS teams reduce repetitive support work, so support and customer success leaders are a starting point."
                : "Choose organizations with the problem you solve, then the person who owns that problem or the budget."}
          </p>
          <AnalysisNotes analysis={state.customerAnalysis} />
          <button
            type="button"
            className="text-button help-button"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          >
            Help me choose <Icon name="arrow" size={16} />
          </button>
          {helpOpen && (
            <div className="help-content">
              <p>
                <strong>Start with three questions</strong>
              </p>
              <ol>
                <li>Who feels this problem most often?</li>
                <li>Who can approve the purchase?</li>
                <li>Where can you serve customers today?</li>
              </ol>
              <p className="small">
                Choose one industry and one or two buyer roles first. You can
                refine the profile later.
              </p>
            </div>
          )}
        </aside>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Actions
        back="/brief"
        backLabel="Back to product brief"
        note="Next: set up discovery. No searches or outreach have started."
      >
        <button
          className="button primary"
          type="submit"
          disabled={isNavigating}
        >
          {isNavigating ? (
            <>
              Opening discovery{" "}
              <span className="button-spinner" aria-hidden="true" />
            </>
          ) : (
            <>
              Confirm customers <Icon name="arrow" />
            </>
          )}
        </button>
      </Actions>
    </form>
  );
}

function Discover() {
  const { state, setState, requestAI, aiBusy } = useWorkspace();
  const [query, setQuery] = useState(state.search.query || defaultDiscoveryQuery(state.profile, state.search.focus));
  const [error, setError] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const settings = { ...state.search, query: query.trim() };
  const context = discoveryContext(state.product, state.profile, settings);
  const research = state.customersConfirmed && context === state.discoveryContext ? state.discoveryAnalysis : undefined;
  function updateQuery(value: string) {
    setQuery(value); setError("");
    setState(previous => ({ ...previous, search: { ...previous.search, query: value } }));
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      if (!context) throw new Error("Confirm your customer profile and enter a search query of 8–300 characters.");
      const { website: ignored, ...product } = state.product; void ignored;
      const result = discoveryResultSchema.parse(await requestAI("discover", {
        runId: state.runId ?? crypto.randomUUID(), product, profile: state.profile, search: settings,
      }));
      setState(previous => ({ ...previous, runId: result.meta.runId, search: settings,
        discoveryAnalysis: result, discoveryContext: context }));
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      setError(error instanceof Error ? error.message : "The search could not be completed.");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportPlan({ ...state, search: settings }), null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url;
    link.download = research ? "gtm-company-discovery.json" : "gtm-discovery-plan.json";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloaded(true);
  }
  return <>
    <div className="status-row"><Status>{research ? "Search complete · Review candidates" : "Ready to search"}</Status><span className="subtle-label">Tavily Search + GPT-6.1 Sol</span></div>
    <form onSubmit={search} aria-busy={!!aiBusy}>
      <div className="two-column">
        <section className="form-stack" aria-label="Discovery settings">
          <h2>Find company candidates</h2>
          <Field id="count" label="Maximum companies" hint="Small batches keep research reviewable. Fewer may match the available evidence.">
            <select id="count" name="companyCount" value={state.search.count} onChange={event => setState(previous => ({ ...previous, search: { ...previous.search, count: event.target.value } }))}>
              <option value="5">Up to 5 companies</option><option value="10">Up to 10 companies</option>
            </select>
          </Field>
          <Field id="focus" label="Research focus">
            <select id="focus" name="researchFocus" value={state.search.focus} onChange={event => {
              const focus = event.target.value;
              const nextQuery = defaultDiscoveryQuery(state.profile, focus); setQuery(nextQuery); setError("");
              setState(previous => ({ ...previous, search: { ...previous.search, focus, query: nextQuery } }));
            }}><option>Product fit and buying signals</option><option>Product fit</option><option>Recent buying signals</option></select>
          </Field>
          <Field id="discovery-query" label="Search query" hint="Review what we send to Tavily. The small-SaaS default starts with YC company pages; edit the query to broaden or change sources.">
            <textarea id="discovery-query" name="query" required minLength={8} maxLength={300} rows={3} value={query} onChange={event => updateQuery(event.target.value)} aria-describedby="discovery-query-hint" />
          </Field>
          <div className="prototype-note">Your query is sent to Tavily. Your approved brief, criteria, and public search snippets are sent to OpenAI to assess fit. One basic search per click; no automatic retries. Do not include secrets or private contact details.</div>
          <div className="info-line"><Icon name="info" /><p>These are company candidates, not verified buyers. Operating status, company size, current event attendance, and purchase intent may be unknown.</p></div>
          <div className="enrichment"><h3>Contact enrichment and outreach</h3><p className="hint">Not connected. No people, email addresses, or messages are requested.</p></div>
        </section>
        <aside className="context-panel">
          <h2>Confirmed customer profile</h2><Status approved>Approved</Status>
          <dl className="profile-list">
            <div><dt>Industry</dt><dd>{state.profile.industry}</dd></div>
            <div><dt>Company size</dt><dd>{state.profile.size || "Any size"}</dd></div>
            <div><dt>Location</dt><dd>{state.profile.location || "Any location"}</dd></div>
            <div><dt>Buyer roles</dt><dd>{state.profile.roles.join(", ")}</dd></div>
            {state.profile.signals.length > 0 && <div><dt>Desired signals · Not observed</dt><dd>{state.profile.signals.join(", ")}</dd></div>}
            {state.profile.exclusions && <div><dt>Exclusions</dt><dd>{state.profile.exclusions}</dd></div>}
          </dl>
          <p className="small">Product: <strong>{state.product.name}</strong></p>
          <Link href="/customers" className="text-link">Edit customer profile</Link>
        </aside>
      </div>
      {error && <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      {state.discoveryAnalysis && !research && <p className="notice">Your criteria or query changed. Run a new search; previous results are not treated as matches or included in exports.</p>}
      <Actions back="/customers" backLabel="Back to customers" note="Search uses the existing demo allowances. Review sources before acting; no outreach is sent.">
        <button className="button primary" type="submit" disabled={!!aiBusy}>{research ? "Search again" : "Find companies"} <Icon name="arrow" /></button>
      </Actions>
    </form>
    {research && <section className="company-research" aria-labelledby="company-results-heading">
      <div className="results-heading"><div><p className="eyebrow">PUBLIC-SOURCE COMPANY RESEARCH</p><h2 id="company-results-heading" tabIndex={-1} ref={resultRef}>{research.leads.length} company candidates</h2></div><span className="status">AI fit assessment · Not verified intent</span></div>
      <p className="hint">Search performed {new Date(research.searchedAt).toLocaleString()}. Search-index snippets may be cached or incomplete. Links and quotes are checked against the retrieved sources, not independently fact-checked.</p>
      <p className="search-receipt">Query: {research.query}</p>
      {research.leads.length === 0 && <p className="notice">No source-backed companies matched this search. Try a broader query; we have not filled the list with invented leads.</p>}
      <ol className="company-list">{research.leads.map((lead, index) => <li key={lead.companyName}>
        <article className="company-row"><div className="company-row-heading"><span className="company-rank">{String(index + 1).padStart(2, "0")}</span><h3>{lead.companyName}</h3><span className="fit-label">AI fit: {lead.fit}</span></div>
          <p className="company-fit">{lead.fitReason}</p>
          <blockquote className="company-quote">“{lead.evidenceQuote}”</blockquote>
          <ul className="company-sources">{lead.sourceIds.map(id => { const source = research.sources.find(s => s.id === id); return source ? <li key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">[{id}] {source.title || new URL(source.url).hostname} ↗</a></li> : null; })}</ul>
          {lead.gaps.length > 0 && <p className="hint"><strong>Still to verify:</strong> {lead.gaps.join(" · ")}</p>}
        </article>
      </li>)}</ol>
      {research.limitations.length > 0 && <div className="research-limitations"><h3>Research limitations</h3><ul>{research.limitations.map(item => <li key={item}>{item}</li>)}</ul></div>}
      <details className="all-search-sources"><summary>All {research.sources.length} retrieved sources</summary><ul>{research.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">[{source.id}] {source.title}</a><p className="hint">{source.excerpt}</p>{(source.operatingStatus || source.teamSize !== undefined) && <p className="hint">Source-reported metadata: {source.operatingStatus || "status unknown"}{source.teamSize !== undefined ? ` · Team size: ${source.teamSize}` : ""}. Not independently verified.</p>}</li>)}</ul></details>
      <p className="analysis-receipt">{research.meta.model} · Run: {research.meta.runId}<br />Tavily request: {research.searchRequestId}</p>
    </section>}
    <div className="discovery-export"><button type="button" className="button secondary" onClick={() => { setDownloaded(false); setPlanOpen(true); }}>{research ? "Preview / export research" : "Preview / export plan"}</button></div>
    {planOpen && <Modal title={research ? "Export company research" : "Your discovery plan"} onClose={() => setPlanOpen(false)}>
      <Status>{research ? `${research.leads.length} sourced company candidates` : "Plan only · No company search in this export"}</Status>
      <p>{research ? "Export includes company candidates, fit assessments, source links, search query, and run receipts alongside your confirmed brief and criteria." : "Export your product brief, approved customer criteria, and search settings without making a paid request."}</p>
      <p className="hint">No contact enrichment or outreach has been performed.</p>
      <button className="button primary full-width" onClick={download}><Icon name="download" />{downloaded ? "Download again" : "Download JSON"}</button>
      <p className="hint" role="status">{downloaded ? "Download requested. Check your browser’s downloads." : "Downloading makes no new API call."}</p>
    </Modal>}
  </>;
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}

function ResetDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Start a fresh workspace?" onClose={onClose}>
      <p>
        This clears the product brief and customer profile saved in this
        browser. Download your plan first if you want to keep it.
      </p>
      <div className="actions">
        <button className="button secondary" onClick={onClose}>
          Keep working
        </button>
        <button className="button primary" onClick={onConfirm}>
          Start over
        </button>
      </div>
    </Modal>
  );
}
