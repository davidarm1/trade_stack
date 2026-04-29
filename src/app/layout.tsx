import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trade Stack",
  description: "Multi-tenant field service, jobs, and invoicing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
