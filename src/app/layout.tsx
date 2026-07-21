import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Batcharr",
  description: "Bulk review and request interface for Radarr and Sonarr.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
