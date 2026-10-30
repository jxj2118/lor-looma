import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { COMMAND_OPS } from '../commands';
import {
  BLOCK_TYPES,
  CONTAINER_TYPES,
  HIGHLIGHT_COLORS,
  INLINE_COLORS,
  THEME_PRESETS,
} from '../constants';
import { parseDocument } from '../parse';
import { cloneJson } from '../parse/repair';
import { createLoomaStore } from '../store';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { createToolHandler } from './handler';
import { LOOMA_AI_GUIDE } from './guide';
import { getToolDefinitions } from './tools';

const HEADINGS = [
  'What Looma is',
  'Workflow',
  'Document model',
  'Ids and locations',
  'Inline text',
  'Writing good slides',
  'Writing good documents',
  'Command reference',
  'Examples',
  'Common mistakes',
];

function words(text: string): string[] {
  return text.split(/\s+/).filter((word) => word.length > 0);
}

function examples(guide: string): Array<{ name: string; json: string }> {
  const found: Array<{ name: string; json: string }> = [];
  const pattern = /<!-- example: ([^>]+?) -->\s*```json\n([\s\S]*?)```/g;
  for (const match of guide.matchAll(pattern)) {
    const name = match[1]?.trim() ?? '';
    const json = match[2] ?? '';
    found.push({ name, json });
  }
  return found;
}

function fixtureStore() {
  const parsed = parseDocument(cloneJson(fixture));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return createLoomaStore(parsed.doc);
}

describe('LOOMA_AI_GUIDE', () => {
  it('stays between 1200 and 2200 words', () => {
    const count = words(LOOMA_AI_GUIDE).length;
    expect(count).toBeGreaterThanOrEqual(1200);
    expect(count).toBeLessThanOrEqual(2200);
  });

  it('uses the ten section headings in order', () => {
    const found = [...LOOMA_AI_GUIDE.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(found).toEqual(HEADINGS);
  });

  it('names every block, container, command, color, and theme preset', () => {
    const tokens = [
      ...BLOCK_TYPES,
      ...CONTAINER_TYPES,
      ...COMMAND_OPS,
      ...INLINE_COLORS,
      ...HIGHLIGHT_COLORS,
      ...THEME_PRESETS,
    ];
    for (const token of tokens) {
      expect(LOOMA_AI_GUIDE, token).toContain(token);
    }
  });

  it('executes every looma_apply example on the fixture', () => {
    const samples = examples(LOOMA_AI_GUIDE);
    expect(samples.length).toBeGreaterThanOrEqual(3);
    const apply = getToolDefinitions().find((tool) => tool.name === 'looma_apply');
    if (!apply) throw new Error('missing looma_apply');
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(apply.parameters);
    for (const sample of samples) {
      const args: unknown = JSON.parse(sample.json);
      expect(args, sample.name).toEqual(expect.objectContaining({ commands: expect.any(Array) }));
      expect(validate(args), `${sample.name} ${JSON.stringify(validate.errors)}`).toBe(true);
      const result = createToolHandler(fixtureStore())('looma_apply', args);
      expect(result.ok, `${sample.name} ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('does not contain placeholders', () => {
    expect(LOOMA_AI_GUIDE).not.toContain('TODO');
    expect(LOOMA_AI_GUIDE).not.toContain('TBD');
    expect(LOOMA_AI_GUIDE.toLowerCase()).not.toContain('lorem');
  });
});
