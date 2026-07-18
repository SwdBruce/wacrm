"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Package,
  Plus,
  RefreshCw,
  Search,
  Users as UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { AssignPackageDialog } from "@/components/platform/assign-package-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PlatformAccountSummary } from "@/lib/platform/types";
import { NewClientDialog } from "./new-client-dialog";

function WhatsAppBadge({
  whatsapp,
}: {
  whatsapp: PlatformAccountSummary["whatsapp"];
}) {
  const t = useTranslations("Platform.common");

  if (!whatsapp) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("noConfig")}
      </Badge>
    );
  }
  const connected = whatsapp.status === "connected";
  return (
    <Badge
      variant={connected ? "default" : "outline"}
      className={connected ? "" : "text-muted-foreground"}
    >
      {connected ? t("connected") : t("disconnected")}
    </Badge>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ClientsList() {
  const t = useTranslations("Platform.clients");
  const tCommon = useTranslations("Platform.common");
  const [accounts, setAccounts] = useState<PlatformAccountSummary[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] =
    useState<PlatformAccountSummary | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/accounts");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? t("loadError"));
      }
      setAccounts(data.accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!accounts) return [];
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => {
      return (
        a.name.toLowerCase().includes(q) ||
        (a.ruc?.toLowerCase().includes(q) ?? false) ||
        a.owner?.full_name?.toLowerCase().includes(q) ||
        a.owner?.email?.toLowerCase().includes(q) ||
        a.whatsapp?.phone_number_id?.toLowerCase().includes(q)
      );
    });
  }, [accounts, query]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("title")}
            </h1>
            {accounts ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {accounts.length}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
            {t("refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAssignTarget(null);
              setAssignOpen(true);
            }}
          >
            <Package />
            {t("assignPackage")}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("newClient")}
          </Button>
        </div>
      </div>

      <div className="relative mt-6 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-8"
        />
      </div>

      <div className="mt-4 rounded-xl ring-1 ring-foreground/10">
        {error ? (
          <div className="p-6 text-center text-sm text-destructive">
            {error}
          </div>
        ) : loading && !accounts ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <UsersIcon className="h-6 w-6" />
            {accounts && accounts.length === 0
              ? t("empty")
              : t("emptySearch")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colOrganisation")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colRuc")}</TableHead>
                <TableHead>{t("colOwner")}</TableHead>
                <TableHead>{t("colMembers")}</TableHead>
                <TableHead>{t("colWhatsapp")}</TableHead>
                <TableHead>{t("colCreated")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link
                      href={`/platform/clients/${a.id}`}
                      className="hover:underline"
                    >
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={a.is_active !== false ? "default" : "outline"}
                      className={
                        a.is_active !== false ? "" : "text-muted-foreground"
                      }
                    >
                      {a.is_active !== false
                        ? t("statusActive")
                        : t("statusInactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {a.ruc ?? tCommon("emDash")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.owner ? (
                      <div className="flex flex-col">
                        <span className="text-foreground">
                          {a.owner.full_name ?? tCommon("emDash")}
                        </span>
                        {a.owner.email ? (
                          <span className="text-xs">{a.owner.email}</span>
                        ) : null}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-amber-300">
                        {t("pendingOwner")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.member_count}
                  </TableCell>
                  <TableCell>
                    <WhatsAppBadge whatsapp={a.whatsapp} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(a.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setAssignTarget(a);
                          setAssignOpen(true);
                        }}
                        aria-label={t("assignAria", { name: a.name })}
                      >
                        <Package />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        nativeButton={false}
                        render={
                          <Link
                            href={`/platform/clients/${a.id}`}
                            aria-label={t("openAria", { name: a.name })}
                          />
                        }
                      >
                        <ChevronRight />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <NewClientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void load()}
      />

      <AssignPackageDialog
        open={assignOpen}
        onOpenChange={(open) => {
          setAssignOpen(open);
          if (!open) setAssignTarget(null);
        }}
        accountId={assignTarget?.id}
        accountName={assignTarget?.name}
        accounts={accounts ?? undefined}
        onAssigned={() => void load()}
      />
    </div>
  );
}
