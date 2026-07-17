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
  /** From the linked package (fratalk-style join). */
  quantity: number;
  unit_price: number;
  duration_days: number;
  categories: MessagePackageCategory[];
  /** COUNT of message_credit_usages for this purchase. */
  used: number;
  /** quantity - used (floored at 0). */
  remaining: number;
  /** True when today is within [starts_at, ends_at]. */
  is_active: boolean;
}
