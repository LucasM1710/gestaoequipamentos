import { LogOut } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toTitleCase } from "@/lib/utils";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/equipamentos": "Equipamentos",
  "/usuarios": "Usuarios",
  "/crm": "Registro de Contato",
  "/relatorios": "Relatorios",
  "/logs": "Logs",
};

export function Header() {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const subtitle = profile ? `${profile.full_name} | ${toTitleCase(profile.role)}` : "Sessao ativa";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/6 bg-appBg/92 px-1 py-3 backdrop-blur-xl">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-marine">ER Analitica</p>
        <h2 className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.06em] text-textPrimary sm:text-[34px]">
          {pageTitles[location.pathname] ?? "ER Analitica"}
        </h2>
        <p className="mt-1 text-sm text-textSecondary">{subtitle}</p>
      </div>
      <Button variant="secondary" className="h-10 gap-2 px-4 py-2" onClick={() => void signOut()}>
        <LogOut className="h-4 w-4" />
        Sair
      </Button>
    </header>
  );
}
