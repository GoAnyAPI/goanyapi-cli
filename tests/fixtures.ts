import type { PublicApiDefinition } from '../src/types.js';

export const testCatalog = [
  {
    id: 'traffic',
    method: 'GET',
    path: '/api/v1/traffic',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        month: { type: 'integer', enum: [3, 6, 12] },
      },
      required: ['domain'],
      additionalProperties: false,
    },
    mcpName: 'goanyapi_traffic',
    description: 'Query website traffic.',
    readOnly: true,
  },
  {
    id: 'dr',
    method: 'GET',
    path: '/api/v1/dr',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
      additionalProperties: false,
    },
    mcpName: 'goanyapi_domain_rating',
    description: 'Query domain rating.',
    readOnly: true,
  },
  {
    id: 'serp',
    method: 'GET',
    path: '/api/v1/serp',
    inputSchema: {
      type: 'object',
      properties: { q: { type: 'string' } },
      required: ['q'],
      additionalProperties: false,
    },
    mcpName: 'goanyapi_serp',
    description: 'Query search results.',
    readOnly: true,
  },
  {
    id: 'bing-serp',
    method: 'GET',
    path: '/api/v1/bing-serp',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        setLang: { type: 'string' },
      },
      required: ['q'],
      additionalProperties: false,
    },
    mcpName: 'goanyapi_bing_serp',
    description: 'Query Bing search results.',
    readOnly: true,
  },
  {
    id: 'transparency',
    method: 'GET',
    path: '/api/v1/transparency',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', minLength: 1 },
        domain: { type: 'string', minLength: 1 },
        creativeIds: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
      oneOf: [
        { type: 'object', required: ['keyword'] },
        { type: 'object', required: ['domain'] },
        { type: 'object', required: ['creativeIds'] },
      ],
      examples: [
        { keyword: 'ai image' },
        { domain: 'example.com' },
        { creativeIds: 'AR123,AR456' },
      ],
    },
    mcpName: 'goanyapi_google_ads_transparency',
    description: 'Query ad transparency.',
    readOnly: true,
  },
  {
    id: 'ads-statistics',
    method: 'GET',
    path: '/api/v1/ads-statistics',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['advertiserSearch', 'advertiserStatistics'],
        },
        keyword: { type: 'string', minLength: 1 },
        advertiserId: { type: 'string', pattern: '^\\d+$' },
        startDay: { type: 'string' },
        endDay: { type: 'string' },
      },
      required: ['action'],
      additionalProperties: false,
      oneOf: [
        {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['advertiserSearch'] },
          },
          required: ['action', 'keyword'],
        },
        {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['advertiserStatistics'] },
          },
          required: ['action', 'advertiserId', 'startDay', 'endDay'],
        },
      ],
      examples: [
        { action: 'advertiserSearch', keyword: 'ai' },
        {
          action: 'advertiserStatistics',
          advertiserId: '39687',
          startDay: '2026-03-01',
          endDay: '2026-03-31',
        },
      ],
    },
    mcpName: 'goanyapi_google_ads_transparency_statistics',
    description: 'Query advertising statistics.',
    readOnly: true,
  },
  {
    id: 'activity-credits',
    method: 'GET',
    path: '/api/v1/activity/credits',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1 },
        size: { type: 'integer', minimum: 1, maximum: 100 },
        type: { type: 'string', enum: ['grant', 'consume'] },
        requestStatus: { type: 'string', enum: ['empty', 'failed'] },
      },
      additionalProperties: false,
    },
    mcpName: 'goanyapi_activity_credits',
    description: 'Query credit activity.',
    readOnly: true,
  },
  {
    id: 'credits-balance',
    method: 'GET',
    path: '/api/v1/credits/balance',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    mcpName: 'goanyapi_credits_balance',
    description: 'Query credit balance.',
    readOnly: true,
  },
] as const satisfies readonly PublicApiDefinition[];

export const trafficDefinition = testCatalog[0];

export function catalogResponse(
  catalog: readonly PublicApiDefinition[] = testCatalog
): Response {
  return Response.json({
    code: 'ok',
    message: 'ok',
    data: { schemaVersion: 1, apis: catalog },
  });
}
