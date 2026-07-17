"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AssignPackageDialog } from "@/components/platform/assign-package-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AccountMessagePurchase } from "@/lib/platform/message-packages";

export function ClientPurchases({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName?: string;
}) {
  const [purchases, setPurchases] = useState<AccountMessagePurchase[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountMessagePurchase | null>(
    null,
  );
  const [remainingInput, setRemainingInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<AccountMessagePurchase | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/platform/accounts/${accountId}/purchases`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load purchases");
      }
      setPurchases(data.purchases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchases");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  function openEdit(purchase: AccountMessagePurchase) {
    setEditTarget(purchase);
    setRemainingInput(String(purchase.remaining));
  }

  async function saveRemaining() {
    if (!editTarget) return;
    const remaining = Number(remainingInput);
    if (!Number.isInteger(remaining) || remaining < 0) {
      toast.error("Remaining must be a non-negative integer");
      return;
    }
    if (remaining > editTarget.quantity) {
      toast.error(`Remaining cannot exceed ${editTarget.quantity}`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/platform/accounts/${accountId}/purchases/${editTarget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remaining }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update remaining");
      toast.success("Remaining updated");
      setEditTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function deletePurchase() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/platform/accounts/${accountId}/purchases/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete purchase");
      toast.success("Package assignment removed");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Message packages ({purchases?.length ?? 0})
        </h2>
        <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
          <Plus />
          Assign package
        </Button>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10">
        {error ? (
          <div className="p-6 text-center text-sm text-destructive">{error}</div>
        ) : loading && !purchases ? (
          <div className="flex h-28 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (purchases?.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No packages assigned yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pack</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(purchases ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-foreground">
                    {p.quantity.toLocaleString()} @ {p.unit_price.toFixed(2)}
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
                  <TableCell className="text-muted-foreground">{p.used}</TableCell>
                  <TableCell className="text-foreground">{p.remaining}</TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "default" : "outline"}>
                      {p.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(p)}
                        aria-label="Edit remaining"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTarget(p)}
                        aria-label="Delete purchase"
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

      <AssignPackageDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        accountId={accountId}
        accountName={accountName}
        onAssigned={() => void load()}
      />

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="border-border bg-popover sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit remaining</DialogTitle>
            <DialogDescription>
              Sets how many credits this assignment has left (0–
              {editTarget?.quantity.toLocaleString() ?? 0}). Usage history
              for this pack is cleared; future template sends count from
              here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="edit-remaining">Remaining</Label>
            <Input
              id="edit-remaining"
              type="number"
              min={0}
              max={editTarget?.quantity ?? undefined}
              step={1}
              value={remainingInput}
              onChange={(e) => setRemainingInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveRemaining();
              }}
            />
            {editTarget ? (
              <p className="text-xs text-muted-foreground">
                Catalog pack size {editTarget.quantity.toLocaleString()}
                {editTarget.quantity_override != null
                  ? ` · current balance ${editTarget.remaining.toLocaleString()}`
                  : ` · currently used ${editTarget.used.toLocaleString()}`}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveRemaining()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="border-border bg-popover sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove package assignment</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `This removes ${deleteTarget.quantity.toLocaleString()} msgs (${deleteTarget.remaining.toLocaleString()} remaining) from this client. Its usage history is deleted too. This can't be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deletePurchase()}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
