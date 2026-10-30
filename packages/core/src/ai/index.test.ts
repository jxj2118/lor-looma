import { describe, expect, it } from 'vitest';
import {
  LOOMA_AI_GUIDE,
  LOOMA_TOOL_NAMES,
  createToolHandler,
  getCommandJsonSchema,
  getDocumentJsonSchema,
  getToolDefinitions,
} from './index';
import type {
  AnthropicToolDefinition,
  JsonSchema,
  JsonSchemaToolDefinition,
  LoomaToolName,
  OpenAIToolDefinition,
  ToolHandler,
  ToolHandlerOptions,
  ToolProvider,
  ToolResult,
} from './index';

function assertExportedTypes(
  _name: LoomaToolName,
  _provider: ToolProvider,
  _openai: OpenAIToolDefinition,
  _anthropic: AnthropicToolDefinition,
  _json: JsonSchemaToolDefinition,
  _handler: ToolHandler,
  _options: ToolHandlerOptions,
  _result: ToolResult,
  _schema: JsonSchema,
): void {
  void _name;
  void _provider;
  void _openai;
  void _anthropic;
  void _json;
  void _handler;
  void _options;
  void _result;
  void _schema;
}

void assertExportedTypes;

const RUNTIME_EXPORTS = {
  LOOMA_TOOL_NAMES,
  LOOMA_AI_GUIDE,
  createToolHandler,
  getCommandJsonSchema,
  getDocumentJsonSchema,
  getToolDefinitions,
} as const;

describe('@lor-looma/core/ai', () => {
  it.each(Object.keys(RUNTIME_EXPORTS))('exports %s', (name) => {
    expect(RUNTIME_EXPORTS[name as keyof typeof RUNTIME_EXPORTS]).toBeDefined();
  });
});
