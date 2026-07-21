"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ThemePicker } from "./theme-picker";
import { Button } from "@/components/ui/button";
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
import { DEFAULT_THEME, type ThemeId } from "@/lib/themes";

interface NewClientDirectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface CreatedClient {
  name: string;
  ownerEmail: string;
  ownerName: string;
}

export function NewClientDirectDialog({
  open,
  onOpenChange,
  onCreated,
}: NewClientDirectDialogProps) {
  const t = useTranslations("Platform.newClientDirect");
  const tCommon = useTranslations("Platform.common");
  const [name, setName] = useState("");
  const [ruc, setRuc] = useState("");
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreatedClient | null>(null);

  function reset() {
    setName("");
    setRuc("");
    setTheme(DEFAULT_THEME);
    setOwnerName("");
    setOwnerEmail("");
    setOwnerPassword("");
    setOwnerPasswordConfirm("");
    setSubmitting(false);
    setResult(null);
  }

  async function createClient() {
    const trimmedName = name.trim();
    const trimmedOwnerName = ownerName.trim();
    const trimmedEmail = ownerEmail.trim();
    const trimmedRuc = ruc.trim();

    if (!trimmedName) {
      toast.error(t("nameRequired"));
      return;
    }
    if (!trimmedOwnerName) {
      toast.error(t("ownerNameRequired"));
      return;
    }
    if (!trimmedEmail) {
      toast.error(t("ownerEmailRequired"));
      return;
    }
    if (ownerPassword.length < 6) {
      toast.error(t("passwordTooShort"));
      return;
    }
    if (ownerPassword !== ownerPasswordConfirm) {
      toast.error(t("passwordsDoNotMatch"));
      return;
    }
    if (!trimmedRuc) {
      toast.error(t("rucRequired"));
      return;
    }
    if (trimmedRuc.length > 32) {
      toast.error(t("rucTooLong"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/platform/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "direct",
          name: trimmedName,
          ruc: trimmedRuc,
          theme,
          owner: {
            fullName: trimmedOwnerName,
            email: trimmedEmail,
            password: ownerPassword,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error ?? t("createError"));
        return;
      }

      setResult({
        name: data.account?.name ?? trimmedName,
        ownerEmail: trimmedEmail,
        ownerName: trimmedOwnerName,
      });
      onCreated();
    } catch (error) {
      console.error("[NewClientDirectDialog] create error:", error);
      toast.error(t("networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="border-border bg-popover sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-popover-foreground">
                <CheckCircle className="size-4 text-primary" />
                {t("createdTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("createdDesc", {
                  name: result.name,
                  owner: result.ownerName,
                  email: result.ownerEmail,
                })}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                {tCommon("done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("description")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="direct-client-name">{t("nameLabel")}</Label>
                <Input
                  id="direct-client-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  placeholder={t("namePlaceholder")}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="direct-client-ruc">{t("rucLabel")}</Label>
                <Input
                  id="direct-client-ruc"
                  value={ruc}
                  onChange={(event) => setRuc(event.target.value)}
                  maxLength={32}
                  placeholder={t("rucPlaceholder")}
                />
              </div>

              <ThemePicker
                id="direct-client-theme"
                value={theme}
                onChange={setTheme}
              />

              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-xs font-medium text-foreground">
                  {t("ownerSectionTitle")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("ownerSectionDesc")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="direct-owner-name">{t("ownerNameLabel")}</Label>
                <Input
                  id="direct-owner-name"
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                  maxLength={100}
                  placeholder={t("ownerNamePlaceholder")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="direct-owner-email">{t("ownerEmailLabel")}</Label>
                <Input
                  id="direct-owner-email"
                  type="email"
                  value={ownerEmail}
                  onChange={(event) => setOwnerEmail(event.target.value)}
                  placeholder={t("ownerEmailPlaceholder")}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="direct-owner-password">{t("passwordLabel")}</Label>
                <Input
                  id="direct-owner-password"
                  type="password"
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="direct-owner-password-confirm">
                  {t("passwordConfirmLabel")}
                </Label>
                <Input
                  id="direct-owner-password-confirm"
                  type="password"
                  value={ownerPasswordConfirm}
                  onChange={(event) =>
                    setOwnerPasswordConfirm(event.target.value)
                  }
                  autoComplete="new-password"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createClient();
                  }}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                onClick={() => void createClient()}
                disabled={
                  submitting ||
                  !name.trim() ||
                  !ruc.trim() ||
                  !ownerName.trim() ||
                  !ownerEmail.trim() ||
                  !ownerPassword
                }
              >
                {submitting ? <Loader2 className="animate-spin" /> : null}
                {t("createBtn")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
