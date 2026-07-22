const erpnextBaseUrl = Deno.env.get("ERPNEXT_BASE_URL") ?? "";
const erpnextApiKey = Deno.env.get("ERPNEXT_API_KEY") ?? "";
const erpnextApiSecret = Deno.env.get("ERPNEXT_API_SECRET") ?? "";

export type ErpnextFilter = [string, string, unknown];

export async function fetchErpnextResource<T>(
  doctype: string,
  options: { filters?: ErpnextFilter[]; orFilters?: ErpnextFilter[]; fields: string[] },
): Promise<T[]> {
  if (!erpnextBaseUrl || !erpnextApiKey || !erpnextApiSecret) {
    throw new Error("Credenciais do ERPNext nao configuradas (ERPNEXT_BASE_URL/ERPNEXT_API_KEY/ERPNEXT_API_SECRET).");
  }

  const params = new URLSearchParams();
  if (options.filters && options.filters.length > 0) {
    params.set("filters", JSON.stringify(options.filters));
  }
  if (options.orFilters && options.orFilters.length > 0) {
    params.set("or_filters", JSON.stringify(options.orFilters));
  }
  params.set("fields", JSON.stringify(options.fields));
  params.set("limit_page_length", "0");

  const url = `${erpnextBaseUrl}/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `token ${erpnextApiKey}:${erpnextApiSecret}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ERPNext respondeu ${response.status} para ${doctype}: ${body}`);
  }

  const payload = (await response.json()) as { data: T[] };
  return payload.data ?? [];
}

const DIACRITICS_PATTERN = /[\u0300-\u036f]/g;

export function normalizeSerial(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
