import type { Permissoes, UserRole } from "@/types";

export function getPermissions(role: UserRole | null): Permissoes {
  return {
    canManageUsers: role === "admin" || role === "gestor",
    canManageEquipamentos: role === "admin",
    canViewDashboard: role === "admin" || role === "gestor" || role === "lider",
    canViewEmails: role === "admin" || role === "gestor" || role === "lider",
    canViewCrm: role === "admin" || role === "gestor" || role === "lider",
    canMoveCrmCards: role === "admin",
    canViewLogs: role === "admin" || role === "gestor",
    canViewRelatorios: role === "admin" || role === "gestor" || role === "lider",
    canRequestReview: role === "gestor",
  };
}

export function getDefaultRoute(role: UserRole | null) {
  if (role === "usuario") {
    return "/equipamentos";
  }

  if (role) {
    return "/dashboard";
  }

  return "/login";
}
