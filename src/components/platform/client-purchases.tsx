"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { AssignPackageDialog } from "@/components/platform/assign-package-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    </div>
  );
}
