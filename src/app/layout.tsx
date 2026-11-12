import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Movie Memory — Good films stay with you",
    template: "%s · Movie Memory",
  },
  description:
    "Find your next favorite film, keep a collection of the ones you love, and discover the stories behind them.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
