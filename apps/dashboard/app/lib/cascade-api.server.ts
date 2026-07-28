class CascadeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CascadeApiError";
  }
}

function getApiUrl(): string {
  const apiUrl = process.env.CASCADE_API_URL;

  if (!apiUrl) {
    throw new Error("CASCADE_API_URL is required");
  }

  if (apiUrl.endsWith("/")) {
    return apiUrl.slice(0, -1);
  }

  return apiUrl;
}

function getApiKey() {
  const apiKey = process.env.CASCADE_DASHBOARD_API_KEY;

  if (!apiKey) {
    throw new Error("CASCADE_DASHBOARD_API_KEY is required");
  }

  return apiKey;
}

export async function cascadeApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
    },
  });

  const body = (await response.json()) as T;

  if (!response.ok) {
    throw new CascadeApiError(response.status, "Cascade API request failed");
  }

  return body;
}
