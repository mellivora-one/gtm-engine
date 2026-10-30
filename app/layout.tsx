import type { Metadata } from "next";
import { WorkspaceProvider } from "@/components/workspace";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTM Engine — Product to pipeline",
  description:
    "Define your product, confirm your ideal customers, and prepare a discovery plan. An interactive onboarding prototype.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
