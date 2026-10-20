import { API_BASE_URL } from "./api/config";

/** Avatar / uploads paths from the API are relative; prefix with API origin for <img src>. */
export function absoluteMediaUrl(path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}
