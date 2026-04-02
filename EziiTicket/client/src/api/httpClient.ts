export type HttpClientOptions = {
  baseUrl?: string;
};

export class HttpError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.data = data;
  }
}

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || "/api";
}

function getAuthToken() {
  try {
    return localStorage.getItem("jwt_token");
  } catch {
    return null;
  }
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const token = getAuthToken();

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const errorFromJson =
      isJson &&
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : null;

    const msg =
      errorFromJson || `Request failed (${res.status})` || "Request failed";
    throw new HttpError(msg, res.status, data);
  }

  return data as T;
}

/** Multipart upload — do not set Content-Type (browser sets boundary). */
export async function httpForm<T>(path: string, formData: FormData, init?: Omit<RequestInit, "body">): Promise<T> {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getAuthToken();
  const res = await fetch(url, {
    method: "POST",
    body: formData,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const errorFromJson =
      isJson &&
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : null;
    const msg = errorFromJson || `Request failed (${res.status})` || "Request failed";
    throw new HttpError(msg, res.status, data);
  }
  return data as T;
}

