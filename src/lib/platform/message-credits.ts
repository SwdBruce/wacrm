// ============================================================
// Message credits — fratalk-style saldo for template sends.
//
// Tables (migration 039) are RLS-locked with no browser policies,
// so every read/write here MUST use the service-role client
// (`supabaseAdmin()`). Callers still own tenancy (pass accountId).
//
// Flow mirrors fratalk validarSaldo + id_compra:
//   1. selectPurchaseForCategory — pick an active pack with remaining
//   2. send to Meta
//   3. recordMessageCreditUsage — insert message_credit_usages
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  isMessagePackageCategory,
  type AccountMessagePurchase,
  type MessagePackageCategory,
} from "@/lib/platform/message-packages";

export class MessageCreditError extends Error {
  readonly code = "insufficient_credits" as const;
  readonly status = 402 as const;
  constructor(message = "No message credits available for this template category") {
    super(message);
    this.name = "MessageCreditError";
  }
}

interface PurchaseRow {
  id: string;
  account_id: string;
  package_id: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  quantity_override: number | null;
}

interface PackageRow {
  id: string;
  quantity: number;
  unit_price: string | number;
  duration_days: number;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isActive(startsAt: string, endsAt: string, today: string): boolean {
  return startsAt <= today && today <= endsAt;
}

/**
 * Map message_templates.category (Title Case from Meta sync) or
 * package category (UPPERCASE) onto the package enum.
 */
export function toPackageCategory(
  value: unknown,
): MessagePackageCategory | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const upper = value.trim().toUpperCase();
  if (isMessagePackageCategory(upper)) return upper;
  return null;
}

function adminDb(db?: SupabaseClient): SupabaseClient {
  return db ?? supabaseAdmin();
}

async function loadPurchaseBalances(
  db: SupabaseClient,
  purchases: PurchaseRow[],
): Promise<AccountMessagePurchase[]> {
  if (purchases.length === 0) return [];

  const packageIds = [...new Set(purchases.map((p) => p.package_id))];
  const purchaseIds = purchases.map((p) => p.id);

  const [packagesRes, categoriesRes, usagesRes] = await Promise.all([
    db
      .from("message_packages")
      .select("id, quantity, unit_price, duration_days")
      .in("id", packageIds),
    db
      .from("message_package_categories")
      .select("package_id, category")
      .in("package_id", packageIds),
    db
      .from("message_credit_usages")
      .select("purchase_id")
      .in("purchase_id", purchaseIds),
  ]);

  if (packagesRes.error) throw packagesRes.error;

  const packById = new Map(
    ((packagesRes.data ?? []) as PackageRow[]).map((p) => [p.id, p]),
  );

  const catsByPackage = new Map<string, MessagePackageCategory[]>();
  for (const row of (categoriesRes.data ?? []) as {
    package_id: string;
    category: string;
  }[]) {
    if (!isMessagePackageCategory(row.category)) continue;
    const list = catsByPackage.get(row.package_id) ?? [];
    list.push(row.category);
    catsByPackage.set(row.package_id, list);
  }

  const usedByPurchase = new Map<string, number>();
  for (const row of (usagesRes.data ?? []) as { purchase_id: string }[]) {
    usedByPurchase.set(
      row.purchase_id,
      (usedByPurchase.get(row.purchase_id) ?? 0) + 1,
    );
  }

  const today = todayUtc();

  return purchases.flatMap((p) => {
    const pack = packById.get(p.package_id);
    if (!pack) return [];
    const catalogQuantity = Number(pack.quantity);
    const override =
      p.quantity_override == null ? null : Number(p.quantity_override);
    const effectiveQuantity =
      override != null && Number.isFinite(override)
        ? override
        : catalogQuantity;
    const used = usedByPurchase.get(p.id) ?? 0;
    return [
      {
        id: p.id,
        account_id: p.account_id,
        package_id: p.package_id,
        starts_at: p.starts_at,
        ends_at: p.ends_at,
        created_at: p.created_at,
        quantity: catalogQuantity,
        quantity_override: override,
        unit_price: Number(pack.unit_price),
        duration_days: Number(pack.duration_days),
        categories: catsByPackage.get(p.package_id) ?? [],
        used,
        remaining: Math.max(0, effectiveQuantity - used),
        is_active: isActive(p.starts_at, p.ends_at, today),
      },
    ];
  });
}

/** List every purchase for an account (active + historical), hydrated. */
export async function listAccountMessagePurchases(
  accountId: string,
  db?: SupabaseClient,
): Promise<AccountMessagePurchase[]> {
  const admin = adminDb(db);
  const { data, error } = await admin
    .from("account_message_purchases")
    .select(
      "id, account_id, package_id, starts_at, ends_at, created_at, quantity_override",
    )
    .eq("account_id", accountId)
    .order("starts_at", { ascending: false });

  if (error) {
    console.error("[listAccountMessagePurchases]", error);
    throw error;
  }

  return loadPurchaseBalances(admin, (data ?? []) as PurchaseRow[]);
}

/**
 * Active purchases that cover `category` and still have remaining
 * credits, ordered by ends_at ascending (use soonest-expiring first).
 */
export async function listAvailablePurchasesForCategory(
  accountId: string,
  category: MessagePackageCategory,
  db?: SupabaseClient,
): Promise<AccountMessagePurchase[]> {
  const hydrated = await listAccountMessagePurchases(accountId, db);
  return hydrated
    .filter(
      (p) =>
        p.is_active &&
        p.remaining > 0 &&
        p.categories.includes(category),
    )
    .sort((a, b) => a.ends_at.localeCompare(b.ends_at));
}

/** Pick one purchase to debit (fratalk validarSaldo `.first()`). */
export async function selectPurchaseForCategory(
  accountId: string,
  category: MessagePackageCategory,
  db?: SupabaseClient,
): Promise<AccountMessagePurchase | null> {
  const available = await listAvailablePurchasesForCategory(
    accountId,
    category,
    db,
  );
  return available[0] ?? null;
}

/**
 * Ensure at least `count` credits remain across active packs for
 * this category (broadcast pre-check). Throws MessageCreditError.
 */
export async function assertCreditsAvailable(
  accountId: string,
  category: MessagePackageCategory,
  count: number,
  db?: SupabaseClient,
): Promise<void> {
  if (count <= 0) return;
  const available = await listAvailablePurchasesForCategory(
    accountId,
    category,
    db,
  );
  const remaining = available.reduce((sum, p) => sum + p.remaining, 0);
  if (remaining < count) {
    throw new MessageCreditError(
      remaining === 0
        ? `No message credits available for ${category} templates`
        : `Not enough message credits for ${category}: need ${count}, have ${remaining}`,
    );
  }
}

/** Insert one usage row against a purchase (after successful Meta send). */
export async function recordMessageCreditUsage(
  accountId: string,
  purchaseId: string,
  db?: SupabaseClient,
): Promise<void> {
  const admin = adminDb(db);
  const { error } = await admin.from("message_credit_usages").insert({
    account_id: accountId,
    purchase_id: purchaseId,
  });
  if (error) {
    // Meta already accepted the message — log loudly but don't fail
    // the send path (same spirit as fratalk: debit is post-send).
    console.error(
      "[recordMessageCreditUsage] failed after successful send:",
      { accountId, purchaseId, error },
    );
  }
}

/**
 * Resolve category from a template row's category field, or throw
 * MessageCreditError when unknown (cannot bill without a category).
 */
export function requirePackageCategory(
  templateCategory: unknown,
): MessagePackageCategory {
  const category = toPackageCategory(templateCategory);
  if (!category) {
    throw new MessageCreditError(
      "Template category is missing or unsupported — sync templates from Meta and try again",
    );
  }
  return category;
}

/** Aggregate remaining across active packs (for UI summary). */
export function summarizeCredits(purchases: AccountMessagePurchase[]): {
  active_packs: number;
  remaining_total: number;
  used_total: number;
  by_category: Record<MessagePackageCategory, number>;
} {
  const by_category: Record<MessagePackageCategory, number> = {
    MARKETING: 0,
    UTILITY: 0,
    AUTHENTICATION: 0,
  };
  let remaining_total = 0;
  let used_total = 0;
  let active_packs = 0;

  for (const p of purchases) {
    if (!p.is_active) continue;
    active_packs += 1;
    remaining_total += p.remaining;
    used_total += p.used;
    for (const cat of p.categories) {
      by_category[cat] += p.remaining;
    }
  }

  return { active_packs, remaining_total, used_total, by_category };
}

/** One hydrated purchase for an account, or null if missing / wrong tenant. */
export async function getAccountMessagePurchase(
  accountId: string,
  purchaseId: string,
  db?: SupabaseClient,
): Promise<AccountMessagePurchase | null> {
  const purchases = await listAccountMessagePurchases(accountId, db);
  return purchases.find((p) => p.id === purchaseId) ?? null;
}

/**
 * Platform-owner adjustment: set remaining without bulk-inserting
 * usage rows. Sets quantity_override = used + targetRemaining so
 * remaining = override - used, and clears any prior override maths.
 *
 * Also deletes existing message_credit_usages for this purchase so a
 * balance edit is a clean slate (avoids leftover rows from the old
 * bulk-insert approach). Real send history still lives in `messages`.
 */
export async function setPurchaseRemaining(
  accountId: string,
  purchaseId: string,
  targetRemaining: number,
  db?: SupabaseClient,
): Promise<AccountMessagePurchase> {
  if (!Number.isInteger(targetRemaining) || targetRemaining < 0) {
    throw new Error("'remaining' must be a non-negative integer");
  }

  const admin = adminDb(db);
  const purchase = await getAccountMessagePurchase(
    accountId,
    purchaseId,
    admin,
  );
  if (!purchase) {
    throw new Error("Purchase not found");
  }
  if (targetRemaining > purchase.quantity) {
    throw new Error(
      `'remaining' cannot exceed pack quantity (${purchase.quantity})`,
    );
  }

  // Drop ledger rows for this purchase — balance edits are authoritative.
  const { error: clearErr } = await admin
    .from("message_credit_usages")
    .delete()
    .eq("purchase_id", purchaseId)
    .eq("account_id", accountId);
  if (clearErr) {
    console.error("[setPurchaseRemaining] clear usages", clearErr);
    throw new Error("Failed to adjust remaining credits");
  }

  const { error: updateErr } = await admin
    .from("account_message_purchases")
    .update({ quantity_override: targetRemaining })
    .eq("id", purchaseId)
    .eq("account_id", accountId);
  if (updateErr) {
    console.error("[setPurchaseRemaining] update override", updateErr);
    throw new Error("Failed to adjust remaining credits");
  }

  const updated = await getAccountMessagePurchase(
    accountId,
    purchaseId,
    admin,
  );
  if (!updated) {
    throw new Error("Purchase not found after update");
  }
  return updated;
}

/** Delete a purchase and its usage rows (cascade). */
export async function deleteAccountMessagePurchase(
  accountId: string,
  purchaseId: string,
  db?: SupabaseClient,
): Promise<void> {
  const admin = adminDb(db);
  const { data, error } = await admin
    .from("account_message_purchases")
    .delete()
    .eq("id", purchaseId)
    .eq("account_id", accountId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[deleteAccountMessagePurchase]", error);
    throw new Error("Failed to delete purchase");
  }
  if (!data) {
    throw new Error("Purchase not found");
  }
}
