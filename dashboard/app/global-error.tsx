"use client";

import { ErrorScreen } from "@/components/ErrorScreen";
import "./globals.css";

/** The last resort, when even the layout fails. It brings its own page, in the dark theme. */
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB" data-theme="dark">
      <body className="px-4">
        <ErrorScreen {...props} />
      </body>
    </html>
  );
}
