import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="app-loading">
      <span className="eyebrow">404 · MISSING SCENE</span>
      <h1>This one isn’t in the collection.</h1>
      <p>The page you’re looking for may have moved.</p>
      <Link href="/" className="button button-primary">
        Back to Discover
      </Link>
    </main>
  );
}
