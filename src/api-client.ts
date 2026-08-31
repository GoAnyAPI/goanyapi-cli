import { ApiRequestError } from './errors.js';
import type { PublicApiDefinition } from './types.js';

export interface ApiResponse {
  status: number;
  body: unknown;
  text: string;
}

function errorMessage(status: number, body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : undefined;
    const code = typeof record.code === 'string' ? record.code : undefined;
    if (message && code) return message + ' (' + code + ')';
    if (message) return message;
  }
  return 'GoAnyAPI request failed with status ' + status + '.';
}

export async function callApi(options: {
  baseUrl: string;
  definition: PublicApiDefinition;
  parameters: Record<string, unknown>;
  credential: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}): Promise<ApiResponse> {
  const url = new URL(
    options.baseUrl.replace(/\/$/, '') + options.definition.path
  );
  for (const [name, value] of Object.entries(options.parameters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(name, String(item));
    } else {
      url.searchParams.set(name, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method: options.definition.method,
      headers: {
        accept: 'application/json',
        authorization: 'Bearer ' + options.credential,
        'user-agent': '@goanyapi/cli/0.1.0',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Preserve non-JSON response text for diagnostics and raw output.
    }
    if (!response.ok) {
      throw new ApiRequestError(
        response.status,
        body,
        errorMessage(response.status, body)
      );
    }
    return { status: response.status, body, text };
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiRequestError(
        0,
        null,
        'GoAnyAPI request timed out after ' + options.timeoutMs / 1000 + ' seconds.'
      );
    }
    throw new ApiRequestError(
      0,
      null,
      error instanceof Error ? error.message : 'GoAnyAPI request failed.'
    );
  } finally {
    clearTimeout(timeout);
  }
}
