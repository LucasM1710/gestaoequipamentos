const erpnextBaseUrl = Deno.env.get("ERPNEXT_BASE_URL") ?? "";
const erpnextApiKey = Deno.env.get("ERPNEXT_API_KEY") ?? "";
const erpnextApiSecret = Deno.env.get("ERPNEXT_API_SECRET") ?? "";

export type ErpnextFilter = [string, string, unknown];

const PAGE_SIZE = 500;

interface FetchOptions {
  filters?: ErpnextFilter[];
  orFilters?: ErpnextFilter[];
  fields: string[];
  orderBy?: string;
}

// Somente leitura: todas as chamadas sao GET. Nenhum ponto deste projeto escreve no ERPNext.
// As paginas sao buscadas em sequencia (nunca em paralelo) para nao ocupar varios workers
// do Frappe ao mesmo tempo e deixar o ERP lento para quem esta usando.
export async function fetchErpnextResource<T>(doctype: string, options: FetchOptions): Promise<T[]> {
  if (!erpnextBaseUrl || !erpnextApiKey || !erpnextApiSecret) {
    throw new Error("Credenciais do ERPNext nao configuradas (ERPNEXT_BASE_URL/ERPNEXT_API_KEY/ERPNEXT_API_SECRET).");
  }

  const results: T[] = [];
  let limitStart = 0;

  while (true) {
    const params = new URLSearchParams();
    if (options.filters && options.filters.length > 0) {
      params.set("filters", JSON.stringify(options.filters));
    }
    if (options.orFilters && options.orFilters.length > 0) {
      params.set("or_filters", JSON.stringify(options.orFilters));
    }
    params.set("fields", JSON.stringify(options.fields));
    params.set("limit_page_length", String(PAGE_SIZE));
    params.set("limit_start", String(limitStart));
    if (options.orderBy) {
      params.set("order_by", options.orderBy);
    }

    const url = `${erpnextBaseUrl}/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`;

    const response = await fetch(url, {
      headers: { Authorization: `token ${erpnextApiKey}:${erpnextApiSecret}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ERPNext respondeu ${response.status} para ${doctype}: ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { data?: T[] };
    const page = payload.data ?? [];
    results.push(...page);

    if (page.length < PAGE_SIZE) break;
    limitStart += PAGE_SIZE;
  }

  return results;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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
