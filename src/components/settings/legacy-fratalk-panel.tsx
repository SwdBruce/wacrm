"use client";

import { LegacyFratalkHistory } from "@/components/legacy/legacy-fratalk-history";
import { SettingsPanelHead } from "@/components/settings/settings-panel-head";
import { useTranslations } from "next-intl";

export function LegacyFratalkPanel() {
  const t = useTranslations("LegacyFratalk");

  return (
    <div className="space-y-6">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      <LegacyFratalkHistory
        apiBase="/api/account/legacy-fratalk"
        showBalance={false}
        compact
      />
    </div>
  );
}
