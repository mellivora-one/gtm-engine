import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">GTM ENGINE · 404</p>
      <h1>This page isn’t in the plan.</h1>
      <p>Return to your workspace to keep going.</p>
      <Link className="button primary" href="/">
        Open workspace
      </Link>
    </main>
  );
}
