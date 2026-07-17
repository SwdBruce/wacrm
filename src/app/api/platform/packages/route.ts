// ============================================================
// /api/platform/packages
//
//   GET  — list every message credit pack + its categories.
//   POST — create a pack with one or more Meta categories.
//
// Platform-owner only. Service-role after requirePlatformOwner.
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
  type MessagePackage,
  type MessagePackageCategory,
} from "@/lib/platform/message-packages";

interface PackageRow {
  id: string;
  quantity: number;
  unit_price: string | number;
  duration_days: number;
  created_at: string;
}

interface CategoryRow {
  package_id: string;
  category: string;
}

function toPackage(
  row: PackageRow,
  categories: MessagePackageCategory[],
): MessagePackage {
  return {
    id: row.id,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    duration_days: Number(row.duration_days),
    categories,
    created_at: row.created_at,
  };
}

export async function GET() {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const [packagesRes, categoriesRes] = await Promise.all([
      db
        .from("message_packages")
        .select("id, quantity, unit_price, duration_days, created_at")
        .order("unit_price", { ascending: true })
        .order("quantity", { ascending: true }),
      db.from("message_package_categories").select("package_id, category"),
    ]);

    if (packagesRes.error) {
      console.error("[GET /api/platform/packages]", packagesRes.error);
      return NextResponse.json(
        { error: "Failed to load packages" },
        { status: 500 },
      );
    }
    if (categoriesRes.error) {
      console.error("[GET /api/platform/packages] categories", categoriesRes.error);
      return NextResponse.json(
        { error: "Failed to load packages" },
        { status: 500 },
      );
    }

    const byPackage = new Map<string, MessagePackageCategory[]>();
    for (const row of (categoriesRes.data ?? []) as CategoryRow[]) {
      if (!isMessagePackageCategory(row.category)) continue;
      const list = byPackage.get(row.package_id) ?? [];
      list.push(row.category);
      byPackage.set(row.package_id, list);
    }

    const packages = ((packagesRes.data ?? []) as PackageRow[]).map((row) =>
      toPackage(row, byPackage.get(row.id) ?? []),
    );

    return NextResponse.json({ packages });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const limit = checkRateLimit(
      `platform:packageCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      quantity?: unknown;
      unit_price?: unknown;
      duration_days?: unknown;
      categories?: unknown;
    } | null;

    const quantity =
      typeof body?.quantity === "number" ? Math.floor(body.quantity) : NaN;
    const unitPrice =
      typeof body?.unit_price === "number" ? body.unit_price : NaN;
    const durationDays =
      typeof body?.duration_days === "number"
        ? Math.floor(body.duration_days)
        : NaN;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "'quantity' must be a positive integer" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return NextResponse.json(
        { error: "'unit_price' must be a non-negative number" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      return NextResponse.json(
        { error: "'duration_days' must be a positive integer" },
        { status: 400 },
      );
    }

    const rawCategories = Array.isArray(body?.categories)
      ? body.categories
      : [];
    const categories = [
      ...new Set(
        rawCategories.filter(isMessagePackageCategory),
      ),
    ] as MessagePackageCategory[];
    if (categories.length === 0) {
      return NextResponse.json(
        {
          error:
            "'categories' must include at least one of MARKETING, UTILITY, AUTHENTICATION",
        },
        { status: 400 },
      );
    }

    const { data: pack, error: packErr } = await db
      .from("message_packages")
      .insert({
        quantity,
        unit_price: unitPrice,
        duration_days: durationDays,
      })
      .select("id, quantity, unit_price, duration_days, created_at")
      .single();

    if (packErr || !pack) {
      console.error("[POST /api/platform/packages]", packErr);
      return NextResponse.json(
        { error: "Failed to create package" },
        { status: 500 },
      );
    }

    const { error: catErr } = await db
      .from("message_package_categories")
      .insert(
        categories.map((category) => ({
          package_id: pack.id,
          category,
        })),
      );

    if (catErr) {
      // Best-effort rollback of the orphan pack row.
      await db.from("message_packages").delete().eq("id", pack.id);
      console.error("[POST /api/platform/packages] categories", catErr);
      return NextResponse.json(
        { error: "Failed to create package categories" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { package: toPackage(pack as PackageRow, categories) },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
