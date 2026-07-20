// ============================================================
// Migrate Fratalk compras → CRM account_message_purchases.
// One compra = one shared credit pool (categories aggregated).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getLegacyCompraByRuc,
  listLegacyBalanceByRuc,
} from '@/lib/fratalk/legacy-queries';
import type { LegacyBalanceRow } from '@/lib/fratalk/legacy-types';
import {
  isMessagePackageCategory,
  type AccountMessagePurchase,
  type MessagePackageCategory,
} from '@/lib/platform/message-packages';
import { listAccountMessagePurchases } from '@/lib/platform/message-credits';

export interface MigratePurchaseResult {
  compra_id: number;
  status: 'migrated' | 'skipped' | 'error';
  reason?: string;
  purchase_id?: string;
  package_id?: string;
  package_created?: boolean;
}

function categoriesKey(categories: string[]): string {
  return [...categories]
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

function toCrmCategories(raw: string[]): MessagePackageCategory[] {
  const out: MessagePackageCategory[] = [];
  for (const value of raw) {
    const upper = value.trim().toUpperCase();
    if (isMessagePackageCategory(upper) && !out.includes(upper)) {
      out.push(upper);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

async function loadMigratedMap(
  db: SupabaseClient,
  accountId: string,
): Promise<Map<number, string>> {
  const { data, error } = await db
    .from('account_message_purchases')
    .select('id, legacy_compra_id')
    .eq('account_id', accountId)
    .not('legacy_compra_id', 'is', null);

  if (error) {
    console.error('[loadMigratedMap]', error);
    throw new Error('Failed to load migrated purchases');
  }

  const map = new Map<number, string>();
  for (const row of data ?? []) {
    const compraId = Number(
      (row as { legacy_compra_id: number | null }).legacy_compra_id,
    );
    if (Number.isInteger(compraId)) {
      map.set(compraId, String((row as { id: string }).id));
    }
  }
  return map;
}

/** Annotate balance rows with CRM migration status. */
export async function annotateLegacyBalanceMigration(
  accountId: string,
  rows: LegacyBalanceRow[],
  db: SupabaseClient,
): Promise<LegacyBalanceRow[]> {
  const migrated = await loadMigratedMap(db, accountId);
  return rows.map((row) => ({
    ...row,
    already_migrated: migrated.has(row.id),
    migrated_purchase_id: migrated.get(row.id) ?? null,
  }));
}

async function findMatchingPackage(
  db: SupabaseClient,
  quantity: number,
  categories: MessagePackageCategory[],
): Promise<{ id: string } | null> {
  const want = categoriesKey(categories);
  const [packagesRes, categoriesRes] = await Promise.all([
    db
      .from('message_packages')
      .select('id, quantity')
      .eq('quantity', quantity),
    db.from('message_package_categories').select('package_id, category'),
  ]);

  if (packagesRes.error || categoriesRes.error) {
    console.error('[findMatchingPackage]', packagesRes.error, categoriesRes.error);
    throw new Error('Failed to load package catalog');
  }

  const catsByPackage = new Map<string, string[]>();
  for (const row of categoriesRes.data ?? []) {
    const packageId = String(
      (row as { package_id: string }).package_id,
    );
    const category = String((row as { category: string }).category);
    const list = catsByPackage.get(packageId) ?? [];
    list.push(category);
    catsByPackage.set(packageId, list);
  }

  for (const pack of packagesRes.data ?? []) {
    const id = String((pack as { id: string }).id);
    const key = categoriesKey(catsByPackage.get(id) ?? []);
    if (key === want) return { id };
  }
  return null;
}

async function createPackageFromLegacy(
  db: SupabaseClient,
  row: LegacyBalanceRow,
  categories: MessagePackageCategory[],
): Promise<string> {
  if (categories.length === 0) {
    throw new Error('Legacy pack has no valid categories');
  }
  if (!Number.isInteger(row.quantity) || row.quantity <= 0) {
    throw new Error('Legacy pack quantity is invalid');
  }
  const durationDays =
    Number.isInteger(row.duration_days) && row.duration_days > 0
      ? row.duration_days
      : 120;
  const unitPrice =
    Number.isFinite(row.unit_price) && row.unit_price >= 0
      ? row.unit_price
      : 0;

  const { data: pack, error } = await db
    .from('message_packages')
    .insert({
      quantity: row.quantity,
      unit_price: unitPrice,
      duration_days: durationDays,
    })
    .select('id')
    .single();

  if (error || !pack) {
    console.error('[createPackageFromLegacy]', error);
    throw new Error('Failed to create catalog package');
  }

  const packageId = String((pack as { id: string }).id);
  const { error: catErr } = await db
    .from('message_package_categories')
    .insert(
      categories.map((category) => ({
        package_id: packageId,
        category,
      })),
    );

  if (catErr) {
    console.error('[createPackageFromLegacy] categories', catErr);
    await db.from('message_packages').delete().eq('id', packageId);
    throw new Error('Failed to create package categories');
  }

  return packageId;
}

async function migrateOneCompra(
  db: SupabaseClient,
  accountId: string,
  ruc: string,
  compraId: number,
  migrated: Map<number, string>,
): Promise<MigratePurchaseResult> {
  if (migrated.has(compraId)) {
    return {
      compra_id: compraId,
      status: 'skipped',
      reason: 'already_migrated',
      purchase_id: migrated.get(compraId),
    };
  }

  const row = await getLegacyCompraByRuc(ruc, compraId);
  if (!row) {
    return {
      compra_id: compraId,
      status: 'error',
      reason: 'compra_not_found',
    };
  }

  if (!row.is_active) {
    return {
      compra_id: compraId,
      status: 'skipped',
      reason: 'not_active',
    };
  }

  if (row.saldo <= 0) {
    return {
      compra_id: compraId,
      status: 'skipped',
      reason: 'no_remaining',
    };
  }

  if (!row.inicio_vigencia || !row.fin_vigencia) {
    return {
      compra_id: compraId,
      status: 'error',
      reason: 'invalid_dates',
    };
  }

  if (row.fin_vigencia < row.inicio_vigencia) {
    return {
      compra_id: compraId,
      status: 'error',
      reason: 'invalid_dates',
    };
  }

  const categories = toCrmCategories(row.categories);
  if (categories.length === 0) {
    return {
      compra_id: compraId,
      status: 'error',
      reason: 'no_categories',
    };
  }

  let packageId: string;
  let packageCreated = false;
  const match = await findMatchingPackage(db, row.quantity, categories);
  if (match) {
    packageId = match.id;
  } else {
    packageId = await createPackageFromLegacy(db, row, categories);
    packageCreated = true;
  }

  // quantity_override = remaining saldo so CRM starts with used=0 and
  // remaining = saldo (matches Fratalk active balance).
  const remaining = Math.max(0, Math.floor(row.saldo));
  if (remaining > row.quantity) {
    return {
      compra_id: compraId,
      status: 'error',
      reason: 'saldo_exceeds_quantity',
    };
  }

  const { data: purchase, error } = await db
    .from('account_message_purchases')
    .insert({
      account_id: accountId,
      package_id: packageId,
      starts_at: row.inicio_vigencia,
      ends_at: row.fin_vigencia,
      quantity_override: remaining,
      legacy_compra_id: compraId,
    })
    .select('id')
    .single();

  if (error || !purchase) {
    // Unique violation → already migrated concurrently
    if (error?.code === '23505') {
      return {
        compra_id: compraId,
        status: 'skipped',
        reason: 'already_migrated',
      };
    }
    console.error('[migrateOneCompra]', error);
    return {
      compra_id: compraId,
      status: 'error',
      reason: 'insert_failed',
    };
  }

  const purchaseId = String((purchase as { id: string }).id);
  migrated.set(compraId, purchaseId);

  return {
    compra_id: compraId,
    status: 'migrated',
    purchase_id: purchaseId,
    package_id: packageId,
    package_created: packageCreated,
  };
}

export async function migrateLegacyPurchases(
  accountId: string,
  ruc: string,
  compraIds: number[],
  db: SupabaseClient,
): Promise<{
  results: MigratePurchaseResult[];
  purchases: AccountMessagePurchase[];
}> {
  const uniqueIds = [
    ...new Set(
      compraIds.filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (uniqueIds.length === 0) {
    throw new Error("'compra_ids' is required");
  }

  const migrated = await loadMigratedMap(db, accountId);
  const results: MigratePurchaseResult[] = [];

  for (const compraId of uniqueIds) {
    try {
      results.push(
        await migrateOneCompra(db, accountId, ruc, compraId, migrated),
      );
    } catch (err) {
      console.error('[migrateLegacyPurchases]', compraId, err);
      results.push({
        compra_id: compraId,
        status: 'error',
        reason: err instanceof Error ? err.message : 'unknown_error',
      });
    }
  }

  const purchases = await listAccountMessagePurchases(accountId, db);
  return { results, purchases };
}

export async function listMigratableActiveCompraIds(
  ruc: string,
  accountId: string,
  db: SupabaseClient,
): Promise<number[]> {
  const rows = await annotateLegacyBalanceMigration(
    accountId,
    await listLegacyBalanceByRuc(ruc),
    db,
  );
  return rows
    .filter((r) => r.is_active && !r.already_migrated)
    .map((r) => r.id);
}
