import { Activity, AlertTriangle, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface KpiCardsProps {
  items: Array<{ label: string; value: number; tone?: "default" | "alert" }>;
}

const iconMap: Record<string, typeof Activity> = {
  "Equipamentos cadastrados": PackageCheck,
  "Equipamentos calibrados": Activity,
  "Equipamentos vencidos": AlertTriangle,
};

export function KpiCards({ items }: KpiCardsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {items.map((item) => {
        const Icon = iconMap[item.label] ?? Activity;
        const isAlert = item.tone === "alert";

        return (
          <Card key={item.label} className="overflow-hidden">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-textSecondary">{item.label}</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.07em] text-textPrimary">{item.value}</p>
              </div>
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  isAlert ? "bg-veoliaRed/8 text-veoliaRed" : "bg-marine/8 text-marine",
                )}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
