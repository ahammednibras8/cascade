export type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  rotatedFromId: string | null;
};

export type ApiKeyScopeDefinition = {
  value: string;
  label: string;
  description: string;
};

export type ApiKeyActionData =
  | {
      ok: true;
      intent: "create";
      apiKey: ApiKey;
      token: string;
    }
  | {
      ok: true;
      intent: "revoke";
      apiKey: ApiKey;
    }
  | {
      ok: true;
      intent: "rotate";
      apiKey: ApiKey;
      token: string;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export type RevealedApiKey = {
  name: string;
  token: string;
};
