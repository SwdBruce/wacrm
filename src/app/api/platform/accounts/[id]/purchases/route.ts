// ============================================================
// /api/platform/accounts/[id]/purchases
//
//   GET  — list purchases for one organisation (+ used/remaining).
//   POST — assign a package (fratalk /add-paquete). starts_at defaults
//          to today; ends_at = starts_at + package.duration_days.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformOwner } from "@/lib/auth/platform";
import { toErrorResponse } from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import {
  isMessagePackageCategory,
  type AccountMessagePurchase,
  type MessagePackageCategory,
} from "@/lib/platform/message-packages";

interface PurchaseRow {
  id: string;
  account_id: string;
  package_id: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

interface PackageRow {
  id: string;
  quantity: number;
  unit_price: string | number;
  duration_days: number;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isActive(startsAt: string, endsAt: string, today: string): boolean {
  return startsAt <= today && today <= endsAt;
}

async function hydratePurchases(
  db: Awaited<ReturnType<typeof requirePlatformOwner>>["admin"],
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

  if (packagesRes.error) {
    throw packagesRes.error;
  }

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
    const quantity = Number(pack.quantity);
    const used = usedByPurchase.get(p.id) ?? 0;
    return [
      {
        id: p.id,
        account_id: p.account_id,
        package_id: p.package_id,
        starts_at: p.starts_at,
        ends_at: p.ends_at,
        created_at: p.created_at,
        quantity,
        unit_price: Number(pack.unit_price),
        duration_days: Number(pack.duration_days),
        categories: catsByPackage.get(p.package_id) ?? [],
        used,
        remaining: Math.max(0, quantity - used),
        is_active: isActive(p.starts_at, p.ends_at, today),
      },
    ];
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;
    const { id: accountId } = await params;

    const { data: account, error: accountErr } = await db
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .maybeSingle();

    if (accountErr) {
      console.error("[GET purchases] account", accountErr);
      return NextResponse.json(
        { error: "Failed to load purchases" },
        { status: 500 },
      );
    }
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data, error } = await db
      .from("account_message_purchases")
      .select("id, account_id, package_id, starts_at, ends_at, created_at")
      .eq("account_id", accountId)
      .order("starts_at", { ascending: false });

    if (error) {
      console.error("[GET purchases]", error);
      return NextResponse.json(
        { error: "Failed to load purchases" },
        { status: 500 },
      );
    }

    const purchases = await hydratePurchases(
      db,
      (data ?? []) as PurchaseRow[],
    );
    return NextResponse.json({ purchases });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const limit = checkRateLimit(
      `platform:purchaseCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id: accountId } = await params;
    const body = (await request.json().catch(() => null)) as {
      package_id?: unknown;
      starts_at?: unknown;
    } | null;

    const packageId =
      typeof body?.package_id === "string" ? body.package_id.trim() : "";
    if (!packageId) {
      return NextResponse.json(
        { error: "'package_id' is required" },
        { status: 400 },
      );
    }

    const startsAt =
      typeof body?.starts_at === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.starts_at)
        ? body.starts_at
        : todayUtc();

    const { data: account, error: accountErr } = await db
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .maybeSingle();

    if (accountErr || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: pack, error: packErr } = await db
      .from("message_packages")
      .select("id, quantity, unit_price, duration_days")
      .eq("id", packageId)
      .maybeSingle();

    if (packErr || !pack) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    const endsAt = addDays(startsAt, Number(pack.duration_days));

    const { data: purchase, error } = await db
      .from("account_message_purchases")
      .insert({
        account_id: accountId,
        package_id: packageId,
        starts_at: startsAt,
        ends_at: endsAt,
      })
      .select("id, account_id, package_id, starts_at, ends_at, created_at")
      .single();

    if (error || !purchase) {
      console.error("[POST purchases]", error);
      return NextResponse.json(
        { error: "Failed to assign package" },
        { status: 500 },
      );
    }

    const [hydrated] = await hydratePurchases(db, [purchase as PurchaseRow]);
    return NextResponse.json({ purchase: hydrated }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
