"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MessagePackage } from "@/lib/platform/message-packages";
import type { PlatformAccountSummary } from "@/lib/platform/types";

interface AssignPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the client is fixed (e.g. from client detail). */
  accountId?: string;
  accountName?: string;
  /** Optional accounts list when the caller already has it (clients list). */
  accounts?: PlatformAccountSummary[];
  onAssigned?: () => void;
}

function packageLabel(pkg: MessagePackage): string {
  return `${pkg.quantity.toLocaleString()} msgs · ${pkg.unit_price.toFixed(2)} · ${pkg.duration_days}d`;
}

export function AssignPackageDialog({
  open,
  onOpenChange,
  accountId: fixedAccountId,
  accountName: fixedAccountName,
  accounts: accountsProp,
  onAssigned,
}: AssignPackageDialogProps) {
  const lockedToAccount = Boolean(fixedAccountId);
  const [accounts, setAccounts] = useState<PlatformAccountSummary[]>(
    accountsProp ?? [],
  );
  const [packages, setPackages] = useState<MessagePackage[]>([]);
  const [accountId, setAccountId] = useState(fixedAccountId ?? "");
  const [packageId, setPackageId] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;

  // Base UI Select shows the raw value (UUID) unless `items` maps
  // each value to a human-readable label for <SelectValue>.
  const accountItems = accounts.map((account) => ({
    value: account.id,
    label: account.name,
  }));
  const packageItems = packages.map((pkg) => ({
    value: pkg.id,
    label: packageLabel(pkg),
  }));

  useEffect(() => {
    if (accountsProp) setAccounts(accountsProp);
  }, [accountsProp]);

  useEffect(() => {
    if (!open) return;

    setAccountId(fixedAccountId ?? "");
    setPackageId("");
    setLoadError(null);

    let cancelled = false;

    async function loadOptions() {
      setLoading(true);
      try {
        const requests: Promise<Response>[] = [
          fetch("/api/platform/packages"),
        ];
        if (!lockedToAccount && !accountsProp) {
          requests.push(fetch("/api/platform/accounts"));
        }

        const [packagesRes, accountsRes] = await Promise.all(requests);
        const packagesData = await packagesRes.json().catch(() => ({}));
        if (!packagesRes.ok) {
          throw new Error(packagesData?.error ?? "Failed to load packages");
        }

        let nextAccounts = accountsProp ?? [];
        if (accountsRes) {
          const accountsData = await accountsRes.json().catch(() => ({}));
          if (!accountsRes.ok) {
            throw new Error(accountsData?.error ?? "Failed to load clients");
          }
          nextAccounts = accountsData.accounts ?? [];
        }

        if (cancelled) return;

        const nextPackages: MessagePackage[] = packagesData.packages ?? [];
        setPackages(nextPackages);
        if (!accountsProp) setAccounts(nextAccounts);
        if (nextPackages.length > 0) setPackageId(nextPackages[0].id);
        if (!lockedToAccount && nextAccounts.length > 0) {
          setAccountId((prev) => prev || nextAccounts[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load options",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [open, fixedAccountId, lockedToAccount, accountsProp]);

  async function assign() {
    if (!accountId) {
      toast.error("Select a client");
      return;
    }
    if (!packageId) {
      toast.error("Select a package");
      return;
    }

    setAssigning(true);
    try {
      const res = await fetch(
        `/api/platform/accounts/${accountId}/purchases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package_id: packageId }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to assign package");

      const clientName =
        fixedAccountName ??
        accounts.find((a) => a.id === accountId)?.name ??
        "client";
      const qty = selectedPackage?.quantity.toLocaleString() ?? "messages";
      toast.success(`Assigned ${qty} messages to ${clientName}`);
      onOpenChange(false);
      onAssigned?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign package</DialogTitle>
          <DialogDescription>
            {lockedToAccount && fixedAccountName
              ? `Credit pack for ${fixedAccountName}. Validity starts today.`
              : "Pick a client and a credit pack. Validity starts today."}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="py-4 text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="flex h-28 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {!lockedToAccount ? (
              <div className="space-y-1.5">
                <Label htmlFor="assign-client">Client</Label>
                <Select
                  value={accountId || null}
                  onValueChange={(value) => {
                    if (value) setAccountId(value);
                  }}
                  items={accountItems}
                >
                  <SelectTrigger id="assign-client" className="w-full">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Create a client first.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="assign-package">Package</Label>
              <Select
                value={packageId || null}
                onValueChange={(value) => {
                  if (value) setPackageId(value);
                }}
                items={packageItems}
              >
                <SelectTrigger id="assign-package" className="w-full">
                  <SelectValue placeholder="Select a package" />
                </SelectTrigger>
                <SelectContent>
                  {packageItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {packages.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Create a package under Platform → Packages first.
                </p>
              ) : null}
            </div>

            {selectedPackage ? (
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                <p className="font-medium text-foreground">
                  {selectedPackage.quantity.toLocaleString()} messages
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {selectedPackage.unit_price.toFixed(2)} / msg ·{" "}
                  {selectedPackage.duration_days} days validity
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedPackage.categories.map((category) => (
                    <Badge key={category} variant="outline">
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assigning}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void assign()}
            disabled={
              assigning ||
              loading ||
              !!loadError ||
              !accountId ||
              !packageId
            }
          >
            {assigning ? <Loader2 className="animate-spin" /> : null}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
