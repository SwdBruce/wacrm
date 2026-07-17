"use client";

import { use } from "react";

import { PlatformGuard } from "@/components/platform/platform-guard";
import { ClientDetail } from "@/components/platform/client-detail";

export default function PlatformClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <PlatformGuard>
      <ClientDetail accountId={id} />
    </PlatformGuard>
  );
}
