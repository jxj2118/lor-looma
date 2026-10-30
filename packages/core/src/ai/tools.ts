import { ID_PATTERN } from '../ids';
import { getCommandJsonSchema } from './jsonSchema';
import type { JsonSchema } from './jsonSchema';

export const LOOMA_TOOL_NAMES = ['looma_get_outline', 'looma_get_cards', 'looma_apply'] as const;

export type LoomaToolName = (typeof LOOMA_TOOL_NAMES)[number];
export type ToolProvider = 'openai' | 'anthropic' | 'json-schema';

export interface OpenAIToolDefinition {
  type: 'function';
  function: { name: LoomaToolName; description: string; parameters: JsonSchema };
}

export interface AnthropicToolDefinition {
  name: LoomaToolName;
  description: string;
  input_schema: JsonSchema;
}

export interface JsonSchemaToolDefinition {
  name: LoomaToolName;
  description: string;
  parameters: JsonSchema;
}

const OUTLINE_DESCRIPTION =
  'Get a compact outline of the current Looma document: title, format, and for every card its id, title and the id, type, nesting depth and a short text preview of every block and container. Call this first to learn the ids you need.';
const CARDS_DESCRIPTION =
  'Read full cards by id. Use as: "json" for exact field values before editing, or as: "markdown" for a readable view where every node is preceded by an <!-- id: ... --> comment. Markdown is read-only.';
const APPLY_DESCRIPTION =
  'Apply a batch of edit commands to the document. The batch is atomic: if any command fails, nothing changes and the errors explain what to fix. Each call is one undo step for the user. Omit ids on new cards and nodes to have them generated; generated ids are returned in createdIds, in creation order.';
const LABEL_DESCRIPTION = 'Short description of the change, shown in the undo history.';

interface ToolSpec {
  name: LoomaToolName;
  description: string;
  parameters: JsonSchema;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function outlineParameters(): JsonSchema {
  return { type: 'object', properties: {}, additionalProperties: false };
}

function cardsParameters(): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['ids'],
    properties: {
      ids: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', pattern: ID_PATTERN.source },
      },
      as: { type: 'string', enum: ['json', 'markdown'], default: 'json' },
    },
  };
}

function applyParameters(): JsonSchema {
  const command = getCommandJsonSchema();
  const items: JsonSchema = {};
  for (const [key, value] of Object.entries(command)) {
    if (key === '$schema' || key === '$defs') continue;
    items[key] = value;
  }
  const parameters: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['commands'],
    properties: {
      commands: { type: 'array', minItems: 1, items },
      label: { type: 'string', description: LABEL_DESCRIPTION },
    },
  };
  if (command.$defs && typeof command.$defs === 'object') parameters.$defs = command.$defs;
  return parameters;
}

function buildSpecs(): ToolSpec[] {
  return [
    {
      name: 'looma_get_outline',
      description: OUTLINE_DESCRIPTION,
      parameters: outlineParameters(),
    },
    { name: 'looma_get_cards', description: CARDS_DESCRIPTION, parameters: cardsParameters() },
    { name: 'looma_apply', description: APPLY_DESCRIPTION, parameters: applyParameters() },
  ];
}

let cached: ToolSpec[] | undefined;

export function getToolDefinitions(options: { provider: 'openai' }): OpenAIToolDefinition[];
export function getToolDefinitions(options: { provider: 'anthropic' }): AnthropicToolDefinition[];
export function getToolDefinitions(options?: {
  provider?: 'json-schema';
}): JsonSchemaToolDefinition[];
export function getToolDefinitions(options?: { provider?: ToolProvider }) {
  const provider = options?.provider ?? 'json-schema';
  const tools = clone((cached ??= buildSpecs()));
  if (provider === 'openai') {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
  if (provider === 'anthropic') {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }
  return tools;
}
