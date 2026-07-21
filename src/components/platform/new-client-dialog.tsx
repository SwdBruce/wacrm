"use client";

import { useState } from "react";
import { Copy, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ThemePicker } from "./theme-picker";
import { Button, buttonVariants } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_THEME, type ThemeId } from "@/lib/themes";

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface CreatedClient {
  name: string;
  url: string;
  expiresInDays: number;
}

export function NewClientDialog({
  open,
  onOpenChange,
  onCreated,
}: NewClientDialogProps) {
  const t = useTranslations("Platform.newClient");
  const tCommon = useTranslations("Platform.common");
  const [name, setName] = useState("");
  const [ruc, setRuc] = useState("");
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [expiry, setExpiry] = useState("7");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreatedClient | null>(null);

  const expiryOptions = [
    { value: "1", label: t("days1") },
    { value: "7", label: t("days7") },
    { value: "30", label: t("days30") },
  ];

  function reset() {
    setName("");
    setRuc("");
    setTheme(DEFAULT_THEME);
    setExpiry("7");
    setSubmitting(false);
    setResult(null);
  }

  async function createClient() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("nameRequired"));
      return;
    }
    const trimmedRuc = ruc.trim();
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
          name: trimmed,
          ruc: trimmedRuc,
          theme,
          expiresInDays: Number(expiry),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error ?? t("createError"));
        return;
      }

      setResult({
        name: data.account?.name ?? trimmed,
        url: data.url,
        expiresInDays: data.expiresInDays,
      });
      onCreated();
    } catch (error) {
      console.error("[NewClientDialog] create error:", error);
      toast.error(t("networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success(t("copiedToast"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  function whatsappShareUrl(created: CreatedClient): string {
    const message = t("whatsappMessage", {
      name: created.name,
      days: created.expiresInDays,
      url: created.url,
    });
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
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
                <Sparkles className="size-4 text-primary" />
                {t("createdTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("createdDesc", { name: result.name })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Label htmlFor="owner-invite-url">{t("inviteLinkLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  id="owner-invite-url"
                  readOnly
                  value={result.url}
                  className="bg-muted font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="button" onClick={() => void copyLink()}>
                  <Copy />
                  {tCommon("copy")}
                </Button>
              </div>

              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <strong className="font-semibold text-amber-100">
                  {t("saveLinkNow")}
                </strong>{" "}
                {t("saveLinkHint")}
              </div>

              <a
                href={whatsappShareUrl(result)}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonVariants({
                  variant: "outline",
                  className: "w-full",
                })}
              >
                <MessageCircle />
                {t("sendViaWhatsApp")}
              </a>
            </div>

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
                <Label htmlFor="client-name">{t("nameLabel")}</Label>
                <Input
                  id="client-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  placeholder={t("namePlaceholder")}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createClient();
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="client-ruc">{t("rucLabel")}</Label>
                <Input
                  id="client-ruc"
                  value={ruc}
                  onChange={(event) => setRuc(event.target.value)}
                  maxLength={32}
                  placeholder={t("rucPlaceholder")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createClient();
                  }}
                />
              </div>

              <ThemePicker
                id="client-theme"
                value={theme}
                onChange={setTheme}
              />

              <div className="space-y-1.5">
                <Label htmlFor="owner-invite-expiry">{t("expiryLabel")}</Label>
                <Select value={expiry} onValueChange={(value) => setExpiry(value ?? "7")}>
                  <SelectTrigger id="owner-invite-expiry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expiryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                disabled={submitting || !name.trim() || !ruc.trim()}
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
