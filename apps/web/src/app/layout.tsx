import type { PropsWithChildren } from "react";
import CivicSafetyAssistant from "@/components/CivicSafetyAssistant";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {children}
        <CivicSafetyAssistant />
      </body>
    </html>
  );
}
