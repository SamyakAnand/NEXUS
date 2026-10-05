import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUS — Created by Samyak Anand",
  description: "NEXUS is an evidence-first autonomous data intelligence project created by Samyak Anand. Explore transparent, inspectable data analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
