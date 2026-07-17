// DTOs for platform-managed message credit packs (fratalk-style).

export type MessagePackageCategory =
  | "MARKETING"
  | "UTILITY"
  | "AUTHENTICATION";

export const MESSAGE_PACKAGE_CATEGORIES: readonly MessagePackageCategory[] = [
  "MARKETING",
  "UTILITY",
  "AUTHENTICATION",
] as const;

export function isMessagePackageCategory(
  value: unknown,
): value is MessagePackageCategory {
  return (
    typeof value === "string" &&
    (MESSAGE_PACKAGE_CATEGORIES as readonly string[]).includes(value)
  );
}

export interface MessagePackage {
  id: string;
  quantity: number;
  unit_price: number;
  duration_days: number;
  categories: MessagePackageCategory[];
  created_at: string;
}

export interface AccountMessagePurchase {
  id: string;
  account_id: string;
  package_id: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  /** Catalog pack size (message_packages.quantity). */
  quantity: number;
  /**
   * When set by platform owner, replaces `quantity` for credit maths.
   * remaining = max(0, (quantity_override ?? quantity) - used).
   */
  quantity_override: number | null;
  unit_price: number;
  duration_days: number;
  categories: MessagePackageCategory[];
  /** COUNT of message_credit_usages for this purchase. */
  used: number;
  /** effective_quantity - used (floored at 0). */
  remaining: number;
  /** True when today is within [starts_at, ends_at]. */
  is_active: boolean;
}
