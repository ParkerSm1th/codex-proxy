export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
  chatgptAccountId: string | null;
}

export interface CodexTokenBundle {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  token_type?: string;
  [key: string]: unknown;
}

export interface BrokerAccessToken {
  accessToken: string;
  chatgptAccountId: string | null;
  expiresAt: number | null;
}

export interface TokenBrokerRpc {
  getAccessToken(userId: string, forceRefresh?: boolean): Promise<BrokerAccessToken>;
}

export interface OpenAIError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

export interface ChatCompletionMessage {
  role: "system" | "developer" | "user" | "assistant" | "tool" | string;
  content?: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
}

export interface ChatCompletionRequest {
  model?: string;
  messages?: ChatCompletionMessage[];
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  parallel_tool_calls?: boolean;
  reasoning?: unknown;
  service_tier?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
