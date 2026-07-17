"use client";

import { PlatformGuard } from "@/components/platform/platform-guard";
import { PackagesList } from "@/components/platform/packages-list";

export default function PlatformPackagesPage() {
  return (
    <PlatformGuard>
      <PackagesList />
    </PlatformGuard>
  );
}
