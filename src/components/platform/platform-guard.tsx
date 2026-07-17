"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/use-auth";

// Client-side gate for the /platform/* section. This is chrome only —
// the real authorization lives in `requirePlatformOwner` on every
// /api/platform route (service-role queries never run until the flag
// is verified server-side). This just avoids flashing the module to a
// normal member who typed the URL directly.
export function PlatformGuard({ children }: { children: React.ReactNode }) {
  const { profileLoading, isPlatformOwner } = useAuth();
  const t = useTranslations("Platform.guard");

  if (profileLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isPlatformOwner) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
