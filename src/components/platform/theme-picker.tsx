"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface ThemePickerProps {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
  id?: string;
}

export function ThemePicker({ value, onChange, id }: ThemePickerProps) {
  const t = useTranslations("Platform.theme");

  return (
    <div className="space-y-1.5">
      <Label id={id}>{t("label")}</Label>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="grid grid-cols-5 gap-2"
      >
        {THEMES.map((theme) => {
          const active = theme.id === value;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={theme.name}
              title={theme.name}
              onClick={() => onChange(theme.id)}
              className={cn(
                "relative flex h-10 items-center justify-center rounded-lg border transition-colors",
                active
                  ? "border-foreground/40 ring-2 ring-primary/40"
                  : "border-border hover:border-foreground/30",
              )}
              style={{ backgroundColor: theme.swatch }}
            >
              {active ? (
                <Check className="size-4 text-white drop-shadow" />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {THEMES.find((theme) => theme.id === value)?.name ?? value}
      </p>
    </div>
  );
}
