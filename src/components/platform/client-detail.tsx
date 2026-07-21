"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Crown,
  Loader2,
  MessageSquare,
  Pencil,
  Radio,
  Users as UsersIcon,
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientPurchases } from "@/components/platform/client-purchases";
import { LegacyFratalkHistory } from "@/components/legacy/legacy-fratalk-history";
import { ThemePicker } from "@/components/platform/theme-picker";
import type {
  PlatformAccountDetail,
  PlatformAccountMember,
} from "@/lib/platform/types";
import type { AccountRole } from "@/lib/auth/roles";
import { DEFAULT_THEME, THEMES, type ThemeId } from "@/lib/themes";

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
  const [section, setSection] = useState("packages");

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [ruc, setRuc] = useState("");
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [purchasesRefreshKey, setPurchasesRefreshKey] = useState(0);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

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
      setTheme(data.account?.theme ?? DEFAULT_THEME);
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

  function openEdit() {
    if (!account) return;
    setName(account.name);
    setRuc(account.ruc ?? "");
    setTheme(account.theme ?? DEFAULT_THEME);
    setSaveError(null);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setSaveError(null);
    if (account) {
      setName(account.name);
      setRuc(account.ruc ?? "");
      setTheme(account.theme ?? DEFAULT_THEME);
    }
  }

  async function saveClient() {
    if (!account) return;

    const trimmedName = name.trim();
    const trimmedRuc = ruc.trim();

    if (!trimmedName) {
      setSaveError(t("nameRequired"));
      return;
    }
    if (!trimmedRuc) {
      setSaveError(t("rucRequired"));
      return;
    }
    if (trimmedRuc.length > 32) {
      setSaveError(t("rucTooLong"));
      return;
    }

    const patch: { name?: string; ruc?: string; theme?: ThemeId } = {};
    if (trimmedName !== account.name) patch.name = trimmedName;
    if (trimmedRuc !== (account.ruc ?? "")) patch.ruc = trimmedRuc;
    if (theme !== (account.theme ?? DEFAULT_THEME)) patch.theme = theme;

    if (Object.keys(patch).length === 0) {
      setEditOpen(false);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/platform/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? t("saveError"));
      }
      setAccount((prev) =>
        prev
          ? {
              ...prev,
              name: trimmedName,
              ruc: trimmedRuc,
              theme,
            }
          : prev,
      );
      setEditOpen(false);
      toast.success(t("savedToast"));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
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
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {account.name}
                </h1>
                <span
                  className="inline-block size-3.5 shrink-0 rounded-full ring-1 ring-foreground/15"
                  style={{
                    backgroundColor:
                      THEMES.find((th) => th.id === account.theme)?.swatch ??
                      THEMES[0].swatch,
                  }}
                  title={
                    THEMES.find((th) => th.id === account.theme)?.name ??
                    account.theme
                  }
                />
                <Badge
                  variant={isActive ? "default" : "outline"}
                  className={isActive ? "" : "text-muted-foreground"}
                >
                  {isActive ? t("statusActive") : t("statusInactive")}
                </Badge>
              </div>
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
              <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                {account.ruc
                  ? t("rucLine", { ruc: account.ruc })
                  : t("rucEmpty")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={openEdit}>
                <Pencil />
                {t("editBtn")}
              </Button>
              <Button
                variant={isActive ? "outline" : "default"}
                size="sm"
                onClick={() => setStatusConfirmOpen(true)}
              >
                {isActive ? t("deactivateBtn") : t("reactivateBtn")}
              </Button>
            </div>
          </div>

          <Dialog
            open={editOpen}
            onOpenChange={(open) => {
              if (!open) closeEdit();
              else setEditOpen(true);
            }}
          >
            <DialogContent className="border-border bg-popover sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("editTitle")}</DialogTitle>
                <DialogDescription>{t("editDescription")}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-client-name">{t("nameLabel")}</Label>
                  <Input
                    id="edit-client-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-client-ruc">{t("rucLabel")}</Label>
                  <Input
                    id="edit-client-ruc"
                    value={ruc}
                    onChange={(e) => setRuc(e.target.value)}
                    maxLength={32}
                    placeholder={t("rucPlaceholder")}
                    className="font-mono"
                  />
                </div>

                <ThemePicker
                  id="edit-client-theme"
                  value={theme}
                  onChange={setTheme}
                />

                {saveError ? (
                  <p className="text-sm text-destructive">{saveError}</p>
                ) : null}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={closeEdit}
                  disabled={saving}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  onClick={() => void saveClient()}
                  disabled={saving || !name.trim() || !ruc.trim()}
                >
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  {tCommon("save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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

          <Tabs value={section} onValueChange={setSection}>
            <TabsList>
              <TabsTrigger value="packages">{t("tabPackages")}</TabsTrigger>
              <TabsTrigger value="fratalk">{t("tabFratalk")}</TabsTrigger>
              <TabsTrigger value="members">{t("tabMembers")}</TabsTrigger>
            </TabsList>

            <TabsContent value="packages" className="pt-3">
              <ClientPurchases
                accountId={accountId}
                accountName={account.name}
                refreshKey={purchasesRefreshKey}
                onChanged={() => setBalanceRefreshKey((k) => k + 1)}
              />
            </TabsContent>

            <TabsContent value="fratalk" className="pt-3">
              <LegacyFratalkHistory
                apiBase={`/api/platform/accounts/${accountId}/legacy-fratalk`}
                showBalance
                allowMigrate
                compact
                balanceRefreshKey={balanceRefreshKey}
                onMigrated={() => setPurchasesRefreshKey((k) => k + 1)}
              />
            </TabsContent>

            <TabsContent value="members" className="pt-3">
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
            </TabsContent>
          </Tabs>
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
