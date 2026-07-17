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
  if (!whatsapp) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No config
      </Badge>
    );
  }
  const connected = whatsapp.status === "connected";
  return (
    <Badge
      variant={connected ? "default" : "outline"}
      className={connected ? "" : "text-muted-foreground"}
    >
      {connected ? "Connected" : "Disconnected"}
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
        throw new Error(data?.error ?? "Failed to load clients");
      }
      setAccounts(data.accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients");
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
              Clients
            </h1>
            {accounts ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {accounts.length}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Every organisation on this deployment. Only you, the platform
            owner, can see this.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
            Refresh
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
            Assign package
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            New client
          </Button>
        </div>
      </div>

      <div className="relative mt-6 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, owner, or phone id"
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
              ? "No client organisations yet."
              : "No clients match your search."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Created</TableHead>
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
                  <TableCell className="text-muted-foreground">
                    {a.owner ? (
                      <div className="flex flex-col">
                        <span className="text-foreground">
                          {a.owner.full_name ?? "—"}
                        </span>
                        {a.owner.email ? (
                          <span className="text-xs">{a.owner.email}</span>
                        ) : null}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-amber-300">
                        Pending owner
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
                        aria-label={`Assign package to ${a.name}`}
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
                            aria-label={`Open ${a.name}`}
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
