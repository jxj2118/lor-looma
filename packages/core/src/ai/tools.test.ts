import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { ID_PATTERN } from '../ids';
import { getToolDefinitions, LOOMA_TOOL_NAMES } from './tools';
import type { JsonSchemaToolDefinition, ToolProvider } from './tools';

const DESCRIPTIONS = {
  looma_get_outline:
    'Get a compact outline of the current Looma document: title, format, and for every card its id, title and the id, type, nesting depth and a short text preview of every block and container. Call this first to learn the ids you need.',
  looma_get_cards:
    'Read full cards by id. Use as: "json" for exact field values before editing, or as: "markdown" for a readable view where every node is preceded by an <!-- id: ... --> comment. Markdown is read-only.',
  looma_apply:
    'Apply a batch of edit commands to the document. The batch is atomic: if any command fails, nothing changes and the errors explain what to fix. Each call is one undo step for the user. Omit ids on new cards and nodes to have them generated; generated ids are returned in createdIds, in creation order.',
} as const;

const BATCH = [
  { op: 'setTitle', title: 'Introduction to Photosynthesis' },
  {
    op: 'insertNode',
    node: { type: 'paragraph', text: 'A quiet aside.', align: 'center' },
    at: { before: 'b_lead' },
  },
  {
    op: 'wrapNodes',
    ids: ['b_title', 'b_lead'],
    container: { type: 'stack', gap: 'sm' },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parametersOf(provider: ToolProvider): Record<string, unknown>[] {
  if (provider === 'openai') {
    return getToolDefinitions({ provider }).map((tool) => tool.function.parameters);
  }
  if (provider === 'anthropic') {
    return getToolDefinitions({ provider }).map((tool) => tool.input_schema);
  }
  return getToolDefinitions({ provider }).map((tool) => tool.parameters);
}

function summary(provider: ToolProvider) {
  if (provider === 'openai') {
    return getToolDefinitions({ provider }).map((tool) => ({
      type: tool.type,
      name: tool.function.name,
      description: tool.function.description,
      required: tool.function.parameters.required ?? null,
    }));
  }
  if (provider === 'anthropic') {
    return getToolDefinitions({ provider }).map((tool) => ({
      name: tool.name,
      description: tool.description,
      required: tool.input_schema.required ?? null,
    }));
  }
  return getToolDefinitions({ provider }).map((tool) => ({
    name: tool.name,
    description: tool.description,
    required: tool.parameters.required ?? null,
  }));
}

describe('LOOMA_TOOL_NAMES', () => {
  it('lists the three public tool names', () => {
    expect(LOOMA_TOOL_NAMES).toEqual(['looma_get_outline', 'looma_get_cards', 'looma_apply']);
  });
});

describe('getToolDefinitions', () => {
  it('snapshots name, description, and top-level required for each provider', () => {
    expect(summary('json-schema')).toMatchSnapshot();
    expect(summary('openai')).toMatchSnapshot();
    expect(summary('anthropic')).toMatchSnapshot();
  });

  it('uses the verbatim tool descriptions', () => {
    const tools = getToolDefinitions();
    expect(tools.map((tool) => tool.name)).toEqual([...LOOMA_TOOL_NAMES]);
    for (const tool of tools) {
      expect(tool.description).toBe(DESCRIPTIONS[tool.name]);
    }
  });

  it('compiles every parameter schema and omits $schema', () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    for (const provider of ['json-schema', 'openai', 'anthropic'] as const) {
      for (const parameters of parametersOf(provider)) {
        expect(parameters.$schema).toBeUndefined();
        expect(() => ajv.compile(parameters)).not.toThrow();
      }
    }
  });

  it('accepts a batch of valid commands and rejects an empty batch', () => {
    const tools = getToolDefinitions();
    const apply = tools.find((tool) => tool.name === 'looma_apply');
    if (!apply) throw new Error('missing looma_apply');
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(apply.parameters);
    expect(validate({ commands: BATCH })).toBe(true);
    expect(validate({ commands: BATCH, label: 'Add a comparison' })).toBe(true);
    expect(validate({ commands: [] })).toBe(false);

    const properties = apply.parameters.properties;
    const label = isRecord(properties) ? properties.label : undefined;
    expect(isRecord(label) ? label.description : undefined).toBe(
      'Short description of the change, shown in the undo history.',
    );
    const ids = isRecord(tools[1]?.parameters.properties)
      ? tools[1].parameters.properties.ids
      : undefined;
    const items = isRecord(ids) ? ids.items : undefined;
    expect(isRecord(items) ? items.pattern : undefined).toBe(ID_PATTERN.source);
  });

  it('returns a deep copy that callers can mutate', () => {
    const first = getToolDefinitions();
    const second = getToolDefinitions();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    const firstApply = first[2] as JsonSchemaToolDefinition;
    const secondApply = second[2] as JsonSchemaToolDefinition;
    firstApply.parameters.properties = { mutated: true };
    expect(secondApply.parameters.properties).not.toEqual({ mutated: true });

    const openai = getToolDefinitions({ provider: 'openai' });
    const anthropic = getToolDefinitions({ provider: 'anthropic' });
    expect(openai[2]?.function.parameters).toEqual(anthropic[2]?.input_schema);
    expect(openai[2]?.function.parameters).not.toBe(anthropic[2]?.input_schema);
  });
});
