import { UsageError } from './errors.js';
import { DEFAULT_ENDPOINTS } from './config.js';
import { coerceParameters, resolveParameterName } from './schema.js';
import type { PublicApiDefinition } from './types.js';

export type OutputMode = 'pretty' | 'json' | 'raw';

export interface GlobalOptions {
  apiKey: string;
  baseUrl: string;
  output: OutputMode;
  dataOnly: boolean;
  timeoutMs: number;
  help: boolean;
  version: boolean;
}

export interface ParsedArguments {
  globals: GlobalOptions;
  rest: string[];
}

function readOptionValue(
  argv: string[],
  index: number,
  inlineValue?: string
): [string, number] {
  if (inlineValue !== undefined) return [inlineValue, index];
  const value = argv[index + 1];
  if (value === undefined) throw new UsageError(argv[index] + ' requires a value.');
  return [value, index + 1];
}

export function parseArguments(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): ParsedArguments {
  const globals: GlobalOptions = {
    apiKey: env.GOANYAPI_API_KEY ?? '',
    baseUrl: env.GOANYAPI_BASE_URL ?? DEFAULT_ENDPOINTS.apiBaseUrl,
    output: 'pretty',
    dataOnly: false,
    timeoutMs: 45_000,
    help: false,
    version: false,
  };
  const rest: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;
    const equals = token.indexOf('=');
    const name = equals >= 0 ? token.slice(0, equals) : token;
    const inlineValue = equals >= 0 ? token.slice(equals + 1) : undefined;

    if (name === '--api-key' || name === '-k') {
      const [value, next] = readOptionValue(argv, index, inlineValue);
      globals.apiKey = value;
      index = next;
    } else if (name === '--base-url') {
      const [value, next] = readOptionValue(argv, index, inlineValue);
      globals.baseUrl = value;
      index = next;
    } else if (name === '--output' || name === '-o') {
      const [value, next] = readOptionValue(argv, index, inlineValue);
      if (value !== 'pretty' && value !== 'json' && value !== 'raw') {
        throw new UsageError('--output must be pretty, json, or raw.');
      }
      globals.output = value;
      index = next;
    } else if (name === '--timeout') {
      const [value, next] = readOptionValue(argv, index, inlineValue);
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new UsageError('--timeout must be a positive number of seconds.');
      }
      globals.timeoutMs = Math.round(seconds * 1000);
      index = next;
    } else if (token === '--data-only') {
      globals.dataOnly = true;
    } else if (token === '--help' || token === '-h') {
      globals.help = true;
    } else if (token === '--version' || token === '-V') {
      globals.version = true;
    } else {
      rest.push(token);
    }
  }

  try {
    const baseUrl = new URL(globals.baseUrl);
    if (baseUrl.protocol !== 'https:' && baseUrl.protocol !== 'http:') throw new Error();
    globals.baseUrl = baseUrl.href.replace(/\/$/, '');
  } catch {
    throw new UsageError('--base-url must be an HTTP or HTTPS URL.');
  }

  return { globals, rest };
}

export function parseCommandParameters(
  definition: PublicApiDefinition,
  tokens: string[]
): Record<string, unknown> {
  const raw = new Map<string, string[]>();
  const positionals: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const equals = token.indexOf('=');
    const option = token.slice(2, equals >= 0 ? equals : undefined);
    const name = resolveParameterName(definition, option);
    if (!name) {
      throw new UsageError('Unknown option --' + option + ' for ' + definition.id + '.');
    }
    const schema = definition.inputSchema.properties?.[name];
    let value = equals >= 0 ? token.slice(equals + 1) : undefined;
    if (value === undefined && schema?.type === 'boolean') {
      const next = tokens[index + 1];
      if (next !== 'true' && next !== 'false' && next !== '1' && next !== '0') {
        value = 'true';
      }
    }
    if (value === undefined) {
      value = tokens[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError('--' + option + ' requires a value.');
      }
      index += 1;
    }
    raw.set(name, [...(raw.get(name) ?? []), value]);
  }

  const required = definition.inputSchema.required ?? [];
  for (const positional of positionals) {
    const name = required.find((candidate) => !raw.has(candidate));
    if (!name) throw new UsageError('Unexpected argument: ' + positional);
    raw.set(name, [positional]);
  }

  return coerceParameters(definition, raw);
}
