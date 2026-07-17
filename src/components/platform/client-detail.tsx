"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Crown,
  MessageSquare,
  Pencil,
  Radio,
  Users as UsersIcon,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientPurchases } from "@/components/platform/client-purchases";
import type {
  PlatformAccountDetail,
  PlatformAccountMember,
} from "@/lib/platform/types";
import type { AccountRole } from "@/lib/auth/roles";

const ROLE_LABEL: Record<AccountRole, string> = {
  owner: "Owner",
  admin: "Admin",
  agent: "Agent",
  viewer: "Viewer",
};

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: number;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-lg font-semibold leading-none text-foreground">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MemberRow({ member }: { member: PlatformAccountMember }) {
  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">
        <div className="flex items-center gap-2">
          {member.full_name ?? "—"}
          {member.is_platform_owner ? (
            <Crown className="h-3.5 w-3.5 text-amber-400" aria-label="Platform owner" />
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {member.email ?? "—"}
      </TableCell>
      <TableCell>
        <Badge variant={member.role === "owner" ? "default" : "outline"}>
          {ROLE_LABEL[member.role]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

export function ClientDetail({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<PlatformAccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Rename state.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/accounts/${accountId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load client");
      }
      setAccount(data.account);
      setName(data.account?.name ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load client");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === account?.name) {
      setEditing(false);
      setName(account?.name ?? "");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/platform/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to rename");
      }
      setAccount((prev) => (prev ? { ...prev, name: trimmed } : prev));
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href="/platform/clients" />}
      >
        <ArrowLeft />
        Back to clients
      </Button>

      {error ? (
        <div className="rounded-xl p-6 text-center text-sm text-destructive ring-1 ring-foreground/10">
          {error}
        </div>
      ) : loading && !account ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : account ? (
        <div className="space-y-6">
          {/* Header + rename */}
          <div>
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  autoFocus
                  className="max-w-sm text-lg"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName();
                    if (e.key === "Escape") {
                      setEditing(false);
                      setName(account.name);
                    }
                  }}
                />
                <Button size="icon-sm" onClick={() => void saveName()} disabled={saving}>
                  <Check />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setEditing(false);
                    setName(account.name);
                    setSaveError(null);
                  }}
                  disabled={saving}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {account.name}
                </h1>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditing(true)}
                  aria-label="Rename organisation"
                >
                  <Pencil />
                </Button>
              </div>
            )}
            {saveError ? (
              <p className="mt-1 text-sm text-destructive">{saveError}</p>
            ) : null}
            <p className="mt-1 text-sm text-muted-foreground">
              {account.owner
                ? `Owner: ${account.owner.full_name ?? "—"}${
                    account.owner.email ? ` · ${account.owner.email}` : ""
                  }`
                : "Owner invitation pending"}
            </p>
            {account.ruc ? (
              <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                RUC: {account.ruc}
              </p>
            ) : null}
          </div>

          {/* WhatsApp snapshot */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">WhatsApp:</span>
            {account.whatsapp ? (
              <>
                <Badge
                  variant={
                    account.whatsapp.status === "connected"
                      ? "default"
                      : "outline"
                  }
                >
                  {account.whatsapp.status === "connected"
                    ? "Connected"
                    : "Disconnected"}
                </Badge>
                {account.whatsapp.phone_number_id ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {account.whatsapp.phone_number_id}
                  </span>
                ) : null}
              </>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                No config
              </Badge>
            )}
          </div>

          {/* Counts */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={UsersIcon} label="Contacts" value={account.counts.contacts} />
            <StatCard
              icon={MessageSquare}
              label="Conversations"
              value={account.counts.conversations}
            />
            <StatCard
              icon={MessageSquare}
              label="Templates"
              value={account.counts.templates}
            />
            <StatCard icon={Radio} label="Broadcasts" value={account.counts.broadcasts} />
          </div>

          <ClientPurchases
            accountId={accountId}
            accountName={account.name}
          />

          {/* Members */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              Members ({account.member_count})
            </h2>
            <div className="rounded-xl ring-1 ring-foreground/10">
              {account.members.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No members.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {account.members.map((m) => (
                      <MemberRow key={m.user_id} member={m} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
