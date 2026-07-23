import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Datas sem hora ("2026-07-20") sao interpretadas pelo JS como meia-noite UTC, o que no
// fuso do Brasil (UTC-3) exibe o dia anterior. Forcamos a leitura como data local.
function parseDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR").format(parseDateValue(value));
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(parseDateValue(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function toTitleCase(value: string) {
  return value
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function getMonthLabels() {
  return ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
}
