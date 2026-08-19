/**
 * Call the Express API.
 * Local Next: same-origin `/api/backend/*` rewrite (cookies work).
 * GitHub Pages / static preview: `NEXT_PUBLIC_API_URL` when set; otherwise
 * callers should use browser public-integration fallbacks (Nager/openFDA).
 */
import { apiRequestBase, isGithubPagesRuntime } from "./runtime-config";

export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

export function isStaticSiteWithoutApi(): boolean {
  return isGithubPagesRuntime() && !apiRequestBase();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = apiRequestBase();
  if (!base) {
    throw new ApiError(
      "API is not available on this static site. Use guest browse, or run the local preview with an API.",
      503
    );
  }

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
