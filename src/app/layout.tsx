import type { ReactNode, ReactElement } from "react";
import "./globals.css";
import { themeBootstrap } from "../lib/theme";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s | Client portal" },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    // The static bootstrap changes only the theme attribute before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
