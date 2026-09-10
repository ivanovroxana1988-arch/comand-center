import type { Metadata } from "next";
import "./globals.css";
import "./editorial.css";

export const metadata: Metadata = {
  title: "Bogdan & Roxana — Command Center",
  description: "Dashboard comun pentru proiecte, taskuri, deadline-uri și blocaje.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro">
      <body className="antialiased">{children}<footer style={{padding:16,textAlign:'right'}}><a href="/auth/logout">Deconectare</a></footer></body>
    </html>
  );
}
