import { UsageError } from './errors.js';
import type { JsonSchema, PublicApiDefinition } from './types.js';

export function toKebabCase(value: string): string {
  return value
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function parseBoolean(value: string, name: string): boolean {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new UsageError('--' + toKebabCase(name) + ' must be true or false.');
}

function parseValue(schema: JsonSchema, values: string[], name: string): unknown {
  if (schema.type === 'array') {
    const items = values.flatMap((value) => value.split(',')).filter(Boolean);
    return items.map((value) =>
      parseValue(schema.items ?? { type: 'string' }, [value], name)
    );
  }
  if (values.length > 1) {
    throw new UsageError('--' + toKebabCase(name) + ' may only be specified once.');
  }
  const value = values[0];
  if (value === undefined) {
    throw new UsageError('--' + toKebabCase(name) + ' requires a value.');
  }

  let parsed: string | number | boolean;
  switch (schema.type) {
    case 'integer':
      if (!/^-?\d+$/.test(value)) {
        throw new UsageError('--' + toKebabCase(name) + ' must be an integer.');
      }
      parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) {
        throw new UsageError('--' + toKebabCase(name) + ' is outside the safe integer range.');
      }
      break;
    case 'number':
      parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new UsageError('--' + toKebabCase(name) + ' must be a number.');
      }
      break;
    case 'boolean':
      parsed = parseBoolean(value, name);
      break;
    default:
      parsed = value;
  }

  if (schema.enum && !schema.enum.includes(parsed)) {
    const alias =
      typeof parsed === 'string'
        ? schema.enum.find(
            (item) => typeof item === 'string' && toKebabCase(item) === parsed
          )
        : undefined;
    if (alias === undefined) {
      throw new UsageError(
        '--' + toKebabCase(name) + ' must be one of: ' +
          schema.enum.map((item) =>
            typeof item === 'string' ? toKebabCase(item) : item
          ).join(', ') + '.'
      );
    }
    parsed = alias;
  }
  if (
    typeof parsed === 'number' &&
    schema.minimum !== undefined &&
    parsed < schema.minimum
  ) {
    throw new UsageError(
      '--' + toKebabCase(name) + ' must be at least ' + schema.minimum + '.'
    );
  }
  if (
    typeof parsed === 'number' &&
    schema.maximum !== undefined &&
    parsed > schema.maximum
  ) {
    throw new UsageError(
      '--' + toKebabCase(name) + ' must be at most ' + schema.maximum + '.'
    );
  }
  if (
    typeof parsed === 'string' &&
    schema.minLength !== undefined &&
    parsed.length < schema.minLength
  ) {
    throw new UsageError(
      '--' + toKebabCase(name) + ' must contain at least ' +
        schema.minLength + ' character(s).'
    );
  }
  if (
    typeof parsed === 'string' &&
    schema.pattern !== undefined &&
    !new RegExp(schema.pattern).test(parsed)
  ) {
    throw new UsageError('--' + toKebabCase(name) + ' has an invalid format.');
  }
  return parsed;
}

function isPresent(result: Record<string, unknown>, name: string): boolean {
  return name in result && result[name] !== '' && result[name] !== undefined;
}

function matchesBranchEnums(
  branch: JsonSchema,
  result: Record<string, unknown>
): boolean {
  for (const [name, schema] of Object.entries(branch.properties ?? {})) {
    if (
      isPresent(result, name) &&
      schema.enum &&
      !schema.enum.includes(result[name] as never)
    ) return false;
  }
  return true;
}

function validateOneOf(
  schema: JsonSchema,
  result: Record<string, unknown>
): void {
  const branches = schema.oneOf;
  if (!branches?.length) return;

  const compatible = branches.filter((branch) => matchesBranchEnums(branch, result));
  if (compatible.length === 1) {
    const missing = (compatible[0]?.required ?? []).find(
      (name) => !isPresent(result, name)
    );
    if (missing) {
      throw new UsageError('Missing required option --' + toKebabCase(missing) + '.');
    }
    return;
  }

  const matching = compatible.filter((branch) =>
    (branch.required ?? []).every((name) => isPresent(result, name))
  );
  if (matching.length !== 1) {
    const alternatives = branches
      .map((branch) => (branch.required ?? [])
        .map((name) => '--' + toKebabCase(name)).join(', '))
      .filter(Boolean)
      .join(' | ');
    throw new UsageError(
      'Parameters must match exactly one mode' +
        (alternatives ? ': ' + alternatives : '') + '.'
    );
  }
}

export function resolveParameterName(
  definition: PublicApiDefinition,
  optionName: string
): string | undefined {
  const properties = definition.inputSchema.properties ?? {};
  return Object.keys(properties).find(
    (name) => name === optionName || toKebabCase(name) === optionName
  );
}

export function coerceParameters(
  definition: PublicApiDefinition,
  raw: ReadonlyMap<string, string[]>
): Record<string, unknown> {
  const properties = definition.inputSchema.properties ?? {};
  const result: Record<string, unknown> = {};

  for (const [name, values] of raw) {
    const schema = properties[name];
    if (!schema) {
      throw new UsageError(
        'Unknown option --' + toKebabCase(name) + ' for ' + definition.id + '.'
      );
    }
    result[name] = parseValue(schema, values, name);
  }

  for (const name of definition.inputSchema.required ?? []) {
    if (!(name in result) || result[name] === '') {
      throw new UsageError('Missing required option --' + toKebabCase(name) + '.');
    }
  }
  validateOneOf(definition.inputSchema, result);
  return result;
}
