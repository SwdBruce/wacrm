"use client";

import { useEffect, useState } from "react";
import { Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
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
      toast.error("Quantity must be a positive number");
      return;
    }
    if (!Number.isFinite(unit_price) || unit_price < 0) {
      toast.error("Unit price must be zero or greater");
      return;
    }
    if (!Number.isFinite(duration_days) || duration_days <= 0) {
      toast.error("Duration must be a positive number of days");
      return;
    }
    if (form.categories.length === 0) {
      toast.error("Select at least one category");
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
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Credit pack size, unit price, validity window, and Meta categories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-quantity">Quantity</Label>
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
            <Label htmlFor="pkg-price">Unit price</Label>
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
            <Label htmlFor="pkg-duration">Duration (days)</Label>
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
            <Label>Categories</Label>
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
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PackagesList() {
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
      if (!res.ok) throw new Error(data?.error ?? "Failed to load packages");
      setPackages(data.packages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load packages");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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
    if (!res.ok) throw new Error(data?.error ?? "Failed to create package");
    toast.success("Package created");
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
    if (!res.ok) throw new Error(data?.error ?? "Failed to update package");
    toast.success("Package updated");
    setEditTarget(null);
    await load();
  }

  async function deletePackage(pkg: MessagePackage) {
    if (
      !window.confirm(
        `Delete pack ${pkg.quantity.toLocaleString()} @ ${pkg.unit_price}?`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/platform/packages/${pkg.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to delete package");
      return;
    }
    toast.success("Package deleted");
    await load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Packages
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Message credit packs you assign to client organisations.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus />
          New package
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
            No packages yet. Create the first credit pack.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Categories</TableHead>
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
                    {pkg.duration_days} days
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
                        aria-label="Edit package"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void deletePackage(pkg)}
                        aria-label="Delete package"
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
        title="New package"
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
        title="Edit package"
        onSubmit={updatePackage}
      />
    </div>
  );
}
