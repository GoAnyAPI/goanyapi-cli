import { toKebabCase } from './schema.js';
import type { OutputMode } from './arguments.js';
import type { JsonSchema, PublicApiDefinition } from './types.js';

function stringify(value: unknown, mode: OutputMode): string {
  return JSON.stringify(value, null, mode === 'pretty' ? 2 : undefined) ?? 'null';
}

export function renderValue(value: unknown, mode: OutputMode): string {
  if (mode === 'raw' && typeof value === 'string') return value;
  return stringify(value, mode);
}

export function renderGeneralHelp(): string {
  return [
    'GoAnyAPI CLI',
    '',
    'Usage:',
    '  goanyapi login',
    '  goanyapi logout',
    '  goanyapi auth status',
    '  goanyapi auth set-key',
    '  goanyapi update [--check]',
    '  goanyapi list [global options]',
    '  goanyapi describe <api> [global options]',
    '  goanyapi <api> [arguments] [global options]',
    '',
    'Examples:',
    '  goanyapi login',
    '  goanyapi traffic example.com --month 3',
    '  goanyapi serp --q "open source" --gl us --data-only',
    '  goanyapi credits-balance',
    '',
    'Global options:',
    '  -k, --api-key <key>       API key (or GOANYAPI_API_KEY)',
    '      --base-url <url>       API base URL (or GOANYAPI_BASE_URL)',
    '  -o, --output <mode>        pretty, json, or raw (default: pretty)',
    '      --data-only            Print only the response data field',
    '      --timeout <seconds>     Request timeout (default: 45)',
    '      --no-update             Skip automatic update for this command',
    '  -h, --help                 Show help',
    '  -V, --version              Show version',
    '',
    'Run "goanyapi list" to see all APIs.',
  ].join('\n');
}

function schemaType(schema: JsonSchema): string {
  if (schema.enum?.length) {
    return schema.enum
      .map((item) => (typeof item === 'string' ? toKebabCase(item) : item))
      .join('|');
  }
  if (schema.type === 'array') return (schema.items?.type ?? 'value') + '[]';
  return schema.type;
}

function renderModes(definition: PublicApiDefinition): string[] {
  const branches = definition.inputSchema.oneOf ?? [];
  if (!branches.length) return [];
  return [
    '',
    'Modes:',
    ...branches.map((branch) => {
      const action = branch.properties?.action?.enum?.[0];
      const mode = typeof action === 'string'
        ? toKebabCase(action)
        : toKebabCase(branch.required?.[0] ?? 'mode');
      const required = (branch.required ?? [])
        .filter((name) => name !== 'action')
        .map((name) => {
          const schema = definition.inputSchema.properties?.[name];
          return '--' + toKebabCase(name) + ' <' +
            schemaType(schema ?? { type: 'string' }) + '>';
        })
        .join(' ');
      return '  ' + mode + (required ? '  ' + required : '');
    }),
  ];
}

function renderExamples(definition: PublicApiDefinition): string[] {
  const examples = definition.inputSchema.examples ?? [];
  const lines = examples
    .filter((example): example is Record<string, unknown> =>
      typeof example === 'object' && example !== null && !Array.isArray(example)
    )
    .map((example) => {
      const action = typeof example.action === 'string' ? example.action : undefined;
      const argumentsText = Object.entries(example)
        .filter(([name]) => name !== 'action')
        .map(([name, value]) =>
          '--' + toKebabCase(name) + ' ' + JSON.stringify(value)
        )
        .join(' ');
      return '  goanyapi ' + definition.id +
        (action ? ' ' + toKebabCase(action) : '') +
        (argumentsText ? ' ' + argumentsText : '');
    });
  return lines.length ? ['', 'Examples:', ...lines] : [];
}

export function renderDescription(definition: PublicApiDefinition): string {
  const required = new Set(definition.inputSchema.required ?? []);
  const properties = Object.entries(definition.inputSchema.properties ?? {});
  const usageOptions = properties
    .filter(([name]) => required.has(name))
    .map(([name]) => '--' + toKebabCase(name) + ' <value>')
    .join(' ');
  const lines = [
    definition.id,
    definition.description,
    '',
    'Usage:',
    '  goanyapi ' + definition.id + (usageOptions ? ' ' + usageOptions : ''),
  ];

  if (properties.length) {
    lines.push('', 'Arguments:');
    const labels = properties.map(([name, schema]) => {
      const requiredLabel = required.has(name) ? ' (required)' : '';
      return '  --' + toKebabCase(name) + ' <' + schemaType(schema) + '>' + requiredLabel;
    });
    const width = Math.max(...labels.map((label) => label.length));
    for (let index = 0; index < properties.length; index += 1) {
      const schema = properties[index]?.[1];
      let description = schema?.description ?? '';
      if (schema?.default !== undefined) {
        description += (description ? '; ' : '') + 'default: ' + schema.default;
      }
      lines.push((labels[index] ?? '').padEnd(width + 2) + description);
    }
  } else {
    lines.push('', 'This API has no arguments.');
  }

  lines.push(...renderModes(definition), ...renderExamples(definition));

  lines.push('', 'Endpoint: ' + definition.method + ' ' + definition.path);
  if (definition.docsPath) {
    lines.push('Docs: https://goanyapi.com' + definition.docsPath);
  }
  return lines.join('\n');
}

export function renderCatalog(
  catalog: readonly PublicApiDefinition[],
  mode: OutputMode
): string {
  if (mode !== 'pretty') {
    return stringify(
      catalog.map(({ id, method, path, description, docsPath, inputSchema }) => ({
        id,
        method,
        path,
        description,
        ...(docsPath ? { docsPath } : {}),
        inputSchema,
      })),
      mode
    );
  }

  const width = Math.max(...catalog.map((definition) => definition.id.length));
  return catalog
    .map(
      (definition) =>
        '  ' + definition.id.padEnd(width) + '  ' + definition.description
    )
    .join('\n');
}
