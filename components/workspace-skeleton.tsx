type SkeletonVariant = "intake" | "brief" | "customers" | "discover";

function SkeletonField({ large = false }: { large?: boolean }) {
  return (
    <div className="skeleton-field">
      <span className="skeleton skeleton-label" />
      <span
        className={`skeleton ${large ? "skeleton-textarea" : "skeleton-input"}`}
      />
    </div>
  );
}

/** Matches the destination's geometry without suggesting that research is running. */
export function WorkspaceSkeleton({
  variant = "intake",
}: {
  variant?: SkeletonVariant;
}) {
  return (
    <div
      className={`workspace-skeleton skeleton-${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">
        Loading your workspace. Your saved work is being opened.
      </span>
      <div aria-hidden="true">
        {variant === "intake" ? (
          <div className="skeleton-intake-content">
            <span className="skeleton skeleton-intro" />
            <SkeletonField large />
            <div className="skeleton-divider" />
            <SkeletonField />
            <span className="skeleton skeleton-caption" />
          </div>
        ) : (
          <>
            <span className="skeleton skeleton-status" />
            <div className="two-column">
              <div className="skeleton-form-content">
                <SkeletonField />
                <SkeletonField large={variant === "brief"} />
                <SkeletonField />
                <SkeletonField />
              </div>
              <div className="skeleton-context">
                <span className="skeleton skeleton-context-title" />
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line short" />
                <div className="skeleton-divider" />
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line short" />
              </div>
            </div>
          </>
        )}
        <div className="skeleton-actions">
          <span className="skeleton skeleton-back" />
          <span className="skeleton skeleton-button" />
        </div>
      </div>
    </div>
  );
}
