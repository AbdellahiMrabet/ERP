export const API: string = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

const TOKEN_KEY = "erp_token";

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function buildHeaders(hasBody: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function check(res: Response, label: string): Promise<Response> {
  if (res.status === 401) {
    // Expired or invalid session: let the AuthProvider sign the user out.
    tokenStore.clear();
    window.dispatchEvent(new Event("auth:logout"));
  }
  if (!res.ok) {
    let message = `${label} failed: ${res.status}`;
    try {
      const body = await res.json();
      message = body.error ?? body.msg ?? message;
    } catch {
      /* response had no JSON body */
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await check(
    await fetch(`${API}${path}`, {
      method,
      headers: buildHeaders(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    `${method} ${path}`
  );
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// Authenticated file download (a plain <a href> cannot send the token).
async function download(path: string, filename: string): Promise<void> {
  const res = await check(
    await fetch(`${API}${path}`, { headers: buildHeaders(false) }),
    `GET ${path}`
  );
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body), // NEW (HR)
  send: (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) =>
    request<void>(method, path, body),
  download,
};
