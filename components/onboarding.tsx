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

type Page = "intake" | "brief" | "customers" | "discover";
const steps = ["Product brief", "Ideal customers", "Discover leads"];

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
  const { state, setState, ready, storageAvailable, isNavigating } =
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
      "Your customer profile is confirmed. Choose a small first search to review.",
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="GTM Engine home">
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
                  {canNavigate ? (
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
            <span className="prototype-badge">Interactive prototype</span>
            <button
              className="text-button reset-button"
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
          )}
          <footer className="workspace-footer">
            <span>
              <span className="save-dot" />
              {storageAvailable
                ? "Saved only in this browser"
                : "Browser storage unavailable · Changes last for this visit"}
            </span>
            <span>No AI, scraping, enrichment, or sending is connected.</span>
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
  const { state, setState, navigate, isNavigating } = useWorkspace();
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
    }));
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setState(draftWorkspace(state));
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
      aria-busy={isNavigating}
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
          maxLength={8000}
          rows={6}
          value={state.intake.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder="What does it do? Who does it help? What problem does it solve?"
          aria-describedby="intake-help"
        />
        <div className="textarea-footer">
          <span>A few sentences are enough.</span>
          <span>
            {state.intake.description.length.toLocaleString()} / 8,000
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
        label="Product website or LinkedIn URL"
        hint="Add a description, a link, or both."
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
        <p>Personal LinkedIn profile? You will choose which project to use.</p>
      </div>
      <div className="prototype-note">
        <strong>A working interface, not a research service yet.</strong> Your
        text carries into an editable brief. Links are saved, not fetched. Use
        the example to explore suggested fields.
      </div>
      {error && (
        <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      <Actions note="Review and confirm your brief before we find customers.">
        <button
          className="button primary"
          type="submit"
          disabled={isNavigating}
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
  const { state, setState, navigate, isNavigating } = useWorkspace();
  const [error, setError] = useState("");
  const personal = isPersonalLinkedIn(state.intake.url);
  const update = (key: keyof Product, value: string) => {
    setError("");
    setState((previous) => ({
      ...previous,
      product: { ...previous.product, [key]: value },
      productConfirmed: false,
      customersConfirmed: false,
    }));
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const website = normalizeUrl(state.product.website);
      setState((previous) => ({
        ...previous,
        product: { ...previous.product, website },
        productConfirmed: true,
        customersConfirmed: false,
      }));
      navigate("/customers");
    } catch {
      setError("Please enter a valid product website, or leave it blank.");
    }
  }
  return (
    <form onSubmit={submit} aria-busy={isNavigating}>
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
            <strong>Which project should we use?</strong> This profile has not
            been fetched. Enter the project name and website below; we will not
            assume your employer is your product.
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
              maxLength={8000}
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
            {state.intake.description ||
              "No description provided. Add product details in the brief."}
          </blockquote>
          <dl>
            <dt>Provided link</dt>
            <dd className="break-word">{state.intake.url || "Not provided"}</dd>
          </dl>
          <hr />
          <h3>You stay in control</h3>
          <p>
            {state.source === "example"
              ? "These are sample suggestions, not an AI analysis. Edit every field to make it yours."
              : "Your text is copied into the brief, not analyzed by AI. Links have not been fetched or verified."}
          </p>
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
      <Actions
        back="/"
        backLabel="Back to input"
        note="Next: choose your ideal customers. No searches or messages have started."
      >
        <button
          className="button primary"
          type="submit"
          disabled={isNavigating}
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
              {["Hiring support agents", "Growing support team"].map(
                (signal) => (
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
                      <span className="signal-kicker">Example signal</span>
                      {signal}
                    </span>
                  </label>
                ),
              )}
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
            {state.source === "example"
              ? "Why these suggestions?"
              : "Make this profile yours"}
          </h3>
          <p>
            {state.source === "example"
              ? "The sample product helps SaaS teams reduce repetitive support work, so support and customer success leaders are a starting point."
              : "Choose organizations with the problem you solve, then the person who owns that problem or the budget."}
          </p>
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
  const { state, setState } = useWorkspace();
  const [planOpen, setPlanOpen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportPlan(state), null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "gtm-discovery-plan.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  }
  return (
    <>
      <div className="status-row">
        <Status>Ready to plan</Status>
        <span className="subtle-label">Live discovery is not connected</span>
      </div>
      <div className="two-column">
        <section className="form-stack" aria-label="Discovery settings">
          <h2>Discovery settings</h2>
          <Field
            id="count"
            label="Companies to find"
            hint="Start small. Review the matches before expanding."
          >
            <select
              id="count"
              name="companyCount"
              value={state.search.count}
              onChange={(event) =>
                setState((previous) => ({
                  ...previous,
                  search: { ...previous.search, count: event.target.value },
                }))
              }
            >
              <option value="5">5 companies</option>
              <option value="10">10 companies</option>
              <option value="25">25 companies</option>
            </select>
          </Field>
          <Field id="focus" label="Research focus">
            <select
              id="focus"
              name="researchFocus"
              value={state.search.focus}
              onChange={(event) =>
                setState((previous) => ({
                  ...previous,
                  search: { ...previous.search, focus: event.target.value },
                }))
              }
            >
              <option>Product fit and buying signals</option>
              <option>Product fit</option>
              <option>Recent buying signals</option>
            </select>
          </Field>
          <div className="returns">
            <h2>What live discovery will return</h2>
            <p className="hint">
              Planned integration · Not available in this prototype
            </p>
            <ul>
              {[
                "Company names and websites",
                "Buyer names and roles, when publicly available",
                "Fit explanations and source links",
              ].map((item) => (
                <li key={item}>
                  <span className="check-icon">
                    <Icon name="check" size={16} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="enrichment">
            <h3>
              Business email enrichment{" "}
              <span className="optional">(optional)</span>
            </h3>
            <div className="switch-row">
              <input
                type="checkbox"
                role="switch"
                aria-label="Business email enrichment, not connected"
                disabled
              />
              <span>Off. Not connected; requires separate approval.</span>
            </div>
          </div>
        </section>
        <aside className="context-panel">
          <h2>Confirmed customer profile</h2>
          <Status approved>Approved</Status>
          <dl className="profile-list">
            <div>
              <dt>Industry</dt>
              <dd>{state.profile.industry}</dd>
            </div>
            <div>
              <dt>Company size</dt>
              <dd>{state.profile.size || "Any size"}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{state.profile.location || "Any location"}</dd>
            </div>
            <div>
              <dt>Buyer roles</dt>
              <dd>
                {state.profile.roles.map((role) => (
                  <span key={role}>{role}</span>
                ))}
              </dd>
            </div>
            {state.profile.signals.length > 0 && (
              <div>
                <dt>Signals</dt>
                <dd>{state.profile.signals.join(", ")}</dd>
              </div>
            )}
            {state.profile.exclusions && (
              <div>
                <dt>Exclusions</dt>
                <dd>{state.profile.exclusions}</dd>
              </div>
            )}
          </dl>
          <p className="small">
            Based on your confirmed product:
            <br />
            <strong>{state.product.name}</strong>
          </p>
          <Link href="/customers" className="text-link">
            Edit customer profile
          </Link>
        </aside>
      </div>
      <Actions
        back="/customers"
        backLabel="Back to customers"
        note="Preview and export your plan. No live search, charges, or outreach."
      >
        <button
          type="button"
          className="button primary"
          onClick={() => {
            setDownloaded(false);
            setPlanOpen(true);
          }}
        >
          Preview discovery plan <Icon name="arrow" />
        </button>
      </Actions>
      {planOpen && (
        <Modal
          title="Your discovery plan is ready"
          onClose={() => setPlanOpen(false)}
        >
          <Status>Plan only · No research performed</Status>
          <p>
            Find up to{" "}
            <strong>
              {state.search.count} {state.profile.industry} companies
            </strong>{" "}
            matching your approved profile, with a focus on{" "}
            {state.search.focus.toLowerCase()}.
          </p>
          <div className="notice">
            <Icon name="info" />
            <p>
              Live search and email enrichment are not connected yet. This
              export contains your product brief, customer criteria, and search
              settings—not leads.
            </p>
          </div>
          <button className="button primary full-width" onClick={download}>
            <Icon name="download" />
            {downloaded ? "Download again" : "Download plan (.json)"}
          </button>
          <p className="hint" role="status">
            {downloaded
              ? "Download requested. Check your browser’s downloads."
              : "No information is sent to another service."}
          </p>
        </Modal>
      )}
    </>
  );
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
