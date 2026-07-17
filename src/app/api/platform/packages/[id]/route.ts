// ============================================================
// /api/platform/packages/[id]
//
//   PATCH  — update quantity / unit_price / duration_days / categories.
//   DELETE — remove a pack (blocked if any purchase references it).
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const limit = checkRateLimit(
      `platform:packageUpdate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      quantity?: unknown;
      unit_price?: unknown;
      duration_days?: unknown;
      categories?: unknown;
    } | null;

    const patch: Record<string, number> = {};

    if (body?.quantity !== undefined) {
      const quantity =
        typeof body.quantity === "number" ? Math.floor(body.quantity) : NaN;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: "'quantity' must be a positive integer" },
          { status: 400 },
        );
      }
      patch.quantity = quantity;
    }
    if (body?.unit_price !== undefined) {
      const unitPrice =
        typeof body.unit_price === "number" ? body.unit_price : NaN;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json(
          { error: "'unit_price' must be a non-negative number" },
          { status: 400 },
        );
      }
      patch.unit_price = unitPrice;
    }
    if (body?.duration_days !== undefined) {
      const durationDays =
        typeof body.duration_days === "number"
          ? Math.floor(body.duration_days)
          : NaN;
      if (!Number.isFinite(durationDays) || durationDays <= 0) {
        return NextResponse.json(
          { error: "'duration_days' must be a positive integer" },
          { status: 400 },
        );
      }
      patch.duration_days = durationDays;
    }

    let categories: MessagePackageCategory[] | null = null;
    if (body?.categories !== undefined) {
      if (!Array.isArray(body.categories)) {
        return NextResponse.json(
          { error: "'categories' must be an array" },
          { status: 400 },
        );
      }
      categories = [
        ...new Set(body.categories.filter(isMessagePackageCategory)),
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
    }

    if (Object.keys(patch).length === 0 && categories === null) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await db
        .from("message_packages")
        .update(patch)
        .eq("id", id);
      if (error) {
        console.error("[PATCH /api/platform/packages/:id]", error);
        return NextResponse.json(
          { error: "Failed to update package" },
          { status: 500 },
        );
      }
    }

    if (categories) {
      const { error: delErr } = await db
        .from("message_package_categories")
        .delete()
        .eq("package_id", id);
      if (delErr) {
        console.error("[PATCH packages categories delete]", delErr);
        return NextResponse.json(
          { error: "Failed to update categories" },
          { status: 500 },
        );
      }
      const { error: insErr } = await db
        .from("message_package_categories")
        .insert(
          categories.map((category) => ({ package_id: id, category })),
        );
      if (insErr) {
        console.error("[PATCH packages categories insert]", insErr);
        return NextResponse.json(
          { error: "Failed to update categories" },
          { status: 500 },
        );
      }
    }

    const { data: pack, error: fetchErr } = await db
      .from("message_packages")
      .select("id, quantity, unit_price, duration_days, created_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !pack) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    const { data: catRows } = await db
      .from("message_package_categories")
      .select("category")
      .eq("package_id", id);

    const resolvedCategories = ((catRows ?? []) as { category: string }[])
      .map((r) => r.category)
      .filter(isMessagePackageCategory);

    return NextResponse.json({
      package: toPackage(pack as PackageRow, resolvedCategories),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const limit = checkRateLimit(
      `platform:packageDelete:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;

    const { count, error: countErr } = await db
      .from("account_message_purchases")
      .select("id", { count: "exact", head: true })
      .eq("package_id", id);

    if (countErr) {
      console.error("[DELETE package] purchase check", countErr);
      return NextResponse.json(
        { error: "Failed to delete package" },
        { status: 500 },
      );
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a package that has been assigned to organisations",
        },
        { status: 409 },
      );
    }

    const { error, count: deleted } = await db
      .from("message_packages")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      console.error("[DELETE /api/platform/packages/:id]", error);
      return NextResponse.json(
        { error: "Failed to delete package" },
        { status: 500 },
      );
    }
    if (!deleted) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
