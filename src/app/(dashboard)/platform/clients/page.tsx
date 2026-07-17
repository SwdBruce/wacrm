"use client";

import { PlatformGuard } from "@/components/platform/platform-guard";
import { ClientsList } from "@/components/platform/clients-list";

export default function PlatformClientsPage() {
  return (
    <PlatformGuard>
      <ClientsList />
    </PlatformGuard>
  );
}
