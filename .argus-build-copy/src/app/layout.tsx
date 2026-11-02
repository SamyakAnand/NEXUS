import type { Metadata } from "next";
import "./globals.css";
import "./argus.css";

export const metadata: Metadata = {
  title: "ARGUS AI — Enterprise Knowledge Intelligence",
  description: "See beyond data. Discover the truth. Explore evidence-led analysis and the ARGUS AI knowledge intelligence prototype.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
