import Link from "next/link";
import { Aperture, ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <div className="footer-brand">
          <Aperture size={17} />
          <span>A little closer to the movies you love.</span>
        </div>
        <div className="footer-links">
          <span>Made for the love of cinema</span>
          <Link href="/about">
            About & credits <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
