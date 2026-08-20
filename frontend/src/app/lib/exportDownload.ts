import { api } from "@/app/lib/api";

/**
 * Download a report spreadsheet. The backend streams an .xlsx blob and names the
 * file via the Content-Disposition header; this reads that name (falling back to
 * a sensible default), then triggers a click-download and revokes the object URL.
 * A longer timeout is used because all-time exports can take a while to build.
 */
export async function downloadExport(
  endpoint: string,
  params: Record<string, unknown>,
  fallback: string,
): Promise<void> {
  const res = await api.get(endpoint, {
    params,
    responseType: "blob",
    timeout: 120000,
  });
  const cd = (res.headers?.["content-disposition"] as string | undefined) ?? "";
  const match = cd.match(/filename="?([^";]+)"?/i);
  const name = match?.[1] ?? fallback;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}