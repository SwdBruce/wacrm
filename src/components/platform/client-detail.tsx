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
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { LegacyFratalkHistory } from "@/components/legacy/legacy-fratalk-history";
import type {
  PlatformAccountDetail,
  PlatformAccountMember,
} from "@/lib/platform/types";
import type { AccountRole } from "@/lib/auth/roles";

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
  const t = useTranslations("Platform.clientDetail");
  const tCommon = useTranslations("Platform.common");

  const roleLabel: Record<AccountRole, string> = {
    owner: tCommon("roleOwner"),
    admin: tCommon("roleAdmin"),
    agent: tCommon("roleAgent"),
    viewer: tCommon("roleViewer"),
  };

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">
        <div className="flex items-center gap-2">
          {member.full_name ?? tCommon("emDash")}
          {member.is_platform_owner ? (
            <Crown
              className="h-3.5 w-3.5 text-amber-400"
              aria-label={t("platformOwnerAria")}
            />
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {member.email ?? tCommon("emDash")}
      </TableCell>
      <TableCell>
        <Badge variant={member.role === "owner" ? "default" : "outline"}>
          {roleLabel[member.role]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

export function ClientDetail({ accountId }: { accountId: string }) {
  const t = useTranslations("Platform.clientDetail");
  const tCommon = useTranslations("Platform.common");
  const [account, setAccount] = useState<PlatformAccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Rename state.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // RUC edit state.
  const [editingRuc, setEditingRuc] = useState(false);
  const [ruc, setRuc] = useState("");
  const [savingRuc, setSavingRuc] = useState(false);
  const [rucSaveError, setRucSaveError] = useState<string | null>(null);

  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/accounts/${accountId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? t("loadError"));
      }
      setAccount(data.account);
      setName(data.account?.name ?? "");
      setRuc(data.account?.ruc ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
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
        throw new Error(data?.error ?? t("renameError"));
      }
      setAccount((prev) => (prev ? { ...prev, name: trimmed } : prev));
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("renameError"));
    } finally {
      setSaving(false);
    }
  }

  function cancelRucEdit() {
    setEditingRuc(false);
    setRuc(account?.ruc ?? "");
    setRucSaveError(null);
  }

  async function saveRuc() {
    const trimmed = ruc.trim();
    if (!trimmed) {
      setRucSaveError(t("rucRequired"));
      return;
    }
    if (trimmed.length > 32) {
      setRucSaveError(t("rucTooLong"));
      return;
    }
    if (trimmed === (account?.ruc ?? "")) {
      cancelRucEdit();
      return;
    }
    setSavingRuc(true);
    setRucSaveError(null);
    try {
      const res = await fetch(`/api/platform/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruc: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? t("rucSaveError"));
      }
      setAccount((prev) => (prev ? { ...prev, ruc: trimmed } : prev));
      setRuc(trimmed);
      setEditingRuc(false);
    } catch (err) {
      setRucSaveError(err instanceof Error ? err.message : t("rucSaveError"));
    } finally {
      setSavingRuc(false);
    }
  }

  async function setAccountActive(nextActive: boolean) {
    setTogglingStatus(true);
    try {
      const res = await fetch(`/api/platform/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.error ??
            (nextActive ? t("reactivateError") : t("deactivateError")),
        );
      }
      setAccount((prev) =>
        prev
          ? {
              ...prev,
              is_active: nextActive,
              deactivated_at: data.account?.deactivated_at ?? null,
            }
          : prev,
      );
      setStatusConfirmOpen(false);
      toast.success(
        nextActive ? t("reactivatedToast") : t("deactivatedToast"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : nextActive
            ? t("reactivateError")
            : t("deactivateError"),
      );
    } finally {
      setTogglingStatus(false);
    }
  }

  const isActive = account?.is_active !== false;

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
        {t("back")}
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
                  aria-label={t("renameAria")}
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
                ? t("ownerLine", {
                    name: account.owner.full_name ?? tCommon("emDash"),
                    email: account.owner.email
                      ? ` · ${account.owner.email}`
                      : "",
                  })
                : t("ownerPending")}
            </p>
            {editingRuc ? (
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <Input
                    value={ruc}
                    onChange={(e) => setRuc(e.target.value)}
                    maxLength={32}
                    autoFocus
                    placeholder={t("rucPlaceholder")}
                    className="max-w-xs font-mono text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveRuc();
                      if (e.key === "Escape") cancelRucEdit();
                    }}
                  />
                  <Button
                    size="icon-sm"
                    onClick={() => void saveRuc()}
                    disabled={savingRuc || !ruc.trim()}
                  >
                    <Check />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={cancelRucEdit}
                    disabled={savingRuc}
                  >
                    <X />
                  </Button>
                </div>
                {rucSaveError ? (
                  <p className="text-sm text-destructive">{rucSaveError}</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-0.5 flex items-center gap-1.5">
                <p className="font-mono text-sm text-muted-foreground">
                  {account.ruc
                    ? t("rucLine", { ruc: account.ruc })
                    : t("rucEmpty")}
                </p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setRuc(account.ruc ?? "");
                    setRucSaveError(null);
                    setEditingRuc(true);
                  }}
                  aria-label={t("editRucAria")}
                >
                  <Pencil />
                </Button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                variant={isActive ? "default" : "outline"}
                className={isActive ? "" : "text-muted-foreground"}
              >
                {isActive ? t("statusActive") : t("statusInactive")}
              </Badge>
              <Button
                variant={isActive ? "outline" : "default"}
                size="sm"
                onClick={() => setStatusConfirmOpen(true)}
              >
                {isActive ? t("deactivateBtn") : t("reactivateBtn")}
              </Button>
            </div>
          </div>

          {/* WhatsApp snapshot */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("whatsappLabel")}</span>
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
                    ? tCommon("connected")
                    : tCommon("disconnected")}
                </Badge>
                {account.whatsapp.phone_number_id ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {account.whatsapp.phone_number_id}
                  </span>
                ) : null}
              </>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                {tCommon("noConfig")}
              </Badge>
            )}
          </div>

          {/* Counts */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={UsersIcon}
              label={t("statContacts")}
              value={account.counts.contacts}
            />
            <StatCard
              icon={MessageSquare}
              label={t("statConversations")}
              value={account.counts.conversations}
            />
            <StatCard
              icon={MessageSquare}
              label={t("statTemplates")}
              value={account.counts.templates}
            />
            <StatCard
              icon={Radio}
              label={t("statBroadcasts")}
              value={account.counts.broadcasts}
            />
          </div>

          <ClientPurchases
            accountId={accountId}
            accountName={account.name}
          />

          <div>
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              {t("legacyTitle")}
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              {t("legacyDescription")}
            </p>
            <LegacyFratalkHistory
              apiBase={`/api/platform/accounts/${accountId}/legacy-fratalk`}
              showBalance
              compact
            />
          </div>

          {/* Members */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              {t("membersTitle", { count: account.member_count })}
            </h2>
            <div className="rounded-xl ring-1 ring-foreground/10">
              {account.members.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {t("noMembers")}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead>{t("colEmail")}</TableHead>
                      <TableHead>{t("colRole")}</TableHead>
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

      <Dialog open={statusConfirmOpen} onOpenChange={setStatusConfirmOpen}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isActive ? t("deactivateTitle") : t("reactivateTitle")}
            </DialogTitle>
            <DialogDescription>
              {isActive
                ? t("deactivateDesc", { name: account?.name ?? "" })
                : t("reactivateDesc", { name: account?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusConfirmOpen(false)}
              disabled={togglingStatus}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant={isActive ? "destructive" : "default"}
              onClick={() => void setAccountActive(!isActive)}
              disabled={togglingStatus || !account}
            >
              {togglingStatus ? (
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : null}
              {isActive ? t("confirmDeactivate") : t("confirmReactivate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
