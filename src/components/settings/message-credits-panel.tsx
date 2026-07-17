"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SettingsPanelHead } from "@/components/settings/settings-panel-head";
import type { AccountMessagePurchase } from "@/lib/platform/message-packages";

interface CreditsSummary {
  active_packs: number;
  remaining_total: number;
  used_total: number;
  by_category: {
    MARKETING: number;
    UTILITY: number;
    AUTHENTICATION: number;
  };
}

export function MessageCreditsPanel() {
  const t = useTranslations("Settings.messageCredits");
  const [purchases, setPurchases] = useState<AccountMessagePurchase[] | null>(
    null,
  );
  const [summary, setSummary] = useState<CreditsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/account/message-credits", {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? t("loadError"));
        }
        if (cancelled) return;
        setPurchases(data.purchases ?? []);
        setSummary(data.summary ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="space-y-6">
      <SettingsPanelHead title={t("title")} description={t("description")} />

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading && !purchases ? (
        <div className="flex h-28 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {summary ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard
                label={t("remaining")}
                value={summary.remaining_total.toLocaleString()}
              />
              <SummaryCard
                label={t("used")}
                value={summary.used_total.toLocaleString()}
              />
              <SummaryCard
                label={t("activePacks")}
                value={String(summary.active_packs)}
              />
              <SummaryCard
                label={t("byCategory")}
                value={`${summary.by_category.UTILITY + summary.by_category.AUTHENTICATION} / ${summary.by_category.MARKETING}`}
                hint={t("byCategoryHint")}
              />
            </div>
          ) : null}

          <div className="rounded-xl ring-1 ring-foreground/10">
            {(purchases?.length ?? 0) === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {t("empty")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colPack")}</TableHead>
                    <TableHead>{t("colCategories")}</TableHead>
                    <TableHead>{t("colValidity")}</TableHead>
                    <TableHead>{t("colUsed")}</TableHead>
                    <TableHead>{t("colRemaining")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(purchases ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-foreground">
                        {p.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.categories.map((category) => (
                            <Badge key={category} variant="outline">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.starts_at} → {p.ends_at}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.used}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {p.remaining}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? "default" : "outline"}>
                          {p.is_active ? t("active") : t("inactive")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-3">
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
