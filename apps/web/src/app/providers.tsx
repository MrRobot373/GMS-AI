"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tooltip } from "radix-ui";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LocaleRoot, type Locale } from "@/i18n";

export function Providers({ children, locale }: { children: ReactNode; locale: Locale }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: (n, e: any) => n < 2 && !(e?.status >= 400 && e?.status < 500), refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <LocaleRoot initial={locale}>
        <Tooltip.Provider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "!bg-surface !border-border !text-fg !rounded-xl !shadow-soft",
                description: "!text-fg-muted",
              },
            }}
          />
        </Tooltip.Provider>
      </LocaleRoot>
    </QueryClientProvider>
  );
}
