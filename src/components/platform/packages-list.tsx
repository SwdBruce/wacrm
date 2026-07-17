"use client";

import { useEffect, useState } from "react";
import { Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  MESSAGE_PACKAGE_CATEGORIES,
  type MessagePackage,
  type MessagePackageCategory,
} from "@/lib/platform/message-packages";

interface PackageFormState {
  quantity: string;
  unit_price: string;
  duration_days: string;
  categories: MessagePackageCategory[];
}

const EMPTY_FORM: PackageFormState = {
  quantity: "",
  unit_price: "",
  duration_days: "",
  categories: [],
};

function PackageFormDialog({
  open,
  onOpenChange,
  initial,
  title,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: PackageFormState;
  title: string;
  onSubmit: (values: {
    quantity: number;
    unit_price: number;
    duration_days: number;
    categories: MessagePackageCategory[];
  }) => Promise<void>;
}) {
  const t = useTranslations("Platform.packages");
  const tCommon = useTranslations("Platform.common");
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  function toggleCategory(category: MessagePackageCategory) {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  }

  async function handleSave() {
    const quantity = Number(form.quantity);
    const unit_price = Number(form.unit_price);
    const duration_days = Number(form.duration_days);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error(t("quantityError"));
      return;
    }
    if (!Number.isFinite(unit_price) || unit_price < 0) {
      toast.error(t("unitPriceError"));
      return;
    }
    if (!Number.isFinite(duration_days) || duration_days <= 0) {
      toast.error(t("durationError"));
      return;
    }
    if (form.categories.length === 0) {
      toast.error(t("categoriesError"));
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        quantity: Math.floor(quantity),
        unit_price,
        duration_days: Math.floor(duration_days),
        categories: form.categories,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("formDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-quantity">{t("quantityLabel")}</Label>
            <Input
              id="pkg-quantity"
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, quantity: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pkg-price">{t("unitPriceLabel")}</Label>
            <Input
              id="pkg-price"
              type="number"
              min={0}
              step="0.01"
              value={form.unit_price}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, unit_price: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pkg-duration">{t("durationLabel")}</Label>
            <Input
              id="pkg-duration"
              type="number"
              min={1}
              value={form.duration_days}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  duration_days: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{t("categoriesLabel")}</Label>
            <div className="space-y-2">
              {MESSAGE_PACKAGE_CATEGORIES.map((category) => (
                <label
                  key={category}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox
                    checked={form.categories.includes(category)}
                    onCheckedChange={() => toggleCategory(category)}
                  />
                  {category}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PackagesList() {
  const t = useTranslations("Platform.packages");
  const [packages, setPackages] = useState<MessagePackage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MessagePackage | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/packages");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? t("loadError"));
      setPackages(data.packages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createPackage(values: {
    quantity: number;
    unit_price: number;
    duration_days: number;
    categories: MessagePackageCategory[];
  }) {
    const res = await fetch("/api/platform/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? t("createError"));
    toast.success(t("createdToast"));
    await load();
  }

  async function updatePackage(values: {
    quantity: number;
    unit_price: number;
    duration_days: number;
    categories: MessagePackageCategory[];
  }) {
    if (!editTarget) return;
    const res = await fetch(`/api/platform/packages/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? t("updateError"));
    toast.success(t("updatedToast"));
    setEditTarget(null);
    await load();
  }

  async function deletePackage(pkg: MessagePackage) {
    if (
      !window.confirm(
        t("deleteConfirm", {
          quantity: pkg.quantity.toLocaleString(),
          price: pkg.unit_price,
        }),
      )
    ) {
      return;
    }
    const res = await fetch(`/api/platform/packages/${pkg.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error ?? t("deleteError"));
      return;
    }
    toast.success(t("deletedToast"));
    await load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("title")}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus />
          {t("newPackage")}
        </Button>
      </div>

      <div className="mt-6 rounded-xl ring-1 ring-foreground/10">
        {error ? (
          <div className="p-6 text-center text-sm text-destructive">{error}</div>
        ) : loading && !packages ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (packages?.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colQuantity")}</TableHead>
                <TableHead>{t("colUnitPrice")}</TableHead>
                <TableHead>{t("colDuration")}</TableHead>
                <TableHead>{t("colCategories")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(packages ?? []).map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium text-foreground">
                    {pkg.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {pkg.unit_price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t("durationDays", { count: pkg.duration_days })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {pkg.categories.map((category) => (
                        <Badge key={category} variant="outline">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditTarget(pkg)}
                        aria-label={t("editAria")}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void deletePackage(pkg)}
                        aria-label={t("deleteAria")}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <PackageFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={EMPTY_FORM}
        title={t("newPackage")}
        onSubmit={createPackage}
      />

      <PackageFormDialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        initial={
          editTarget
            ? {
                quantity: String(editTarget.quantity),
                unit_price: String(editTarget.unit_price),
                duration_days: String(editTarget.duration_days),
                categories: editTarget.categories,
              }
            : EMPTY_FORM
        }
        title={t("editPackage")}
        onSubmit={updatePackage}
      />
    </div>
  );
}
