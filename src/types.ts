export type JsonSchema = {
  type: 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array';
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: Array<string | number | boolean>;
  items?: JsonSchema;
  default?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean;
};

export interface PublicApiDefinition {
  readonly id: string;
  readonly method: 'GET' | 'POST';
  readonly path: `/api/v1/${string}`;
  readonly inputSchema: JsonSchema;
  readonly mcpName: `goanyapi_${string}`;
  readonly description: string;
  readonly readOnly: true;
  readonly docsPath?: `/docs/${string}`;
}
