import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bare Træn · Administration",
  description: "Administrér træningsmål, øvelser og belønninger i Bare Træn.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
