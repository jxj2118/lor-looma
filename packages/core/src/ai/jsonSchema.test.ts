import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { COMMAND_OPS, LoomaCommandSchema } from '../commands';
import { applyCommands } from '../commands/applyCommands';
import { parseDocument } from '../parse';
import { cloneJson } from '../parse/repair';
import { isCssColor } from '../schema/primitives';
import type { LoomaDocument } from '../schema';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { findNode } from '../tree/tree';
import { getCommandJsonSchema, getDocumentJsonSchema } from './jsonSchema';
import type { JsonSchema } from './jsonSchema';

const COLOR_DESCRIPTION = 'CSS color: #rgb, #rrggbb, rgb(r, g, b) or hsl(h, s%, l%)';
const PATCH_DESCRIPTION =
  'Fields to change on the node. Same field names as the node type; null removes an optional field. Cannot contain id, type or children.';
const LOOMA_DESCRIPTION = 'Schema version. Always 1.';

const COMMAND_DESCRIPTIONS: Record<string, string> = {
  setTitle: 'Set the document title.',
  setFormat:
    'Switch between presentation (16:9 cards) and document (long-form pages). Content is kept.',
  setTheme:
    'Change the theme preset and/or override theme variables. An override set to null is removed.',
  putAsset:
    'Add or replace an image asset. Omit id to create a new one; the new id is returned in createdIds.',
  removeAsset: 'Remove an asset that is no longer referenced by any card or block.',
  insertCard:
    'Insert a new card (slide or page). Omit ids to have them generated. Defaults to the end of the document.',
  updateCard: "Change a card's accent image, background or speaker notes. null removes a field.",
  moveCard: 'Move a card to another position.',
  duplicateCard: 'Copy a card and all its content right after the original, with new ids.',
  splitCard:
    'Split an overflowing card at a top-level node. Nodes from that node onward move into a new card inserted immediately after and keep their ids.',
  deleteCard: 'Delete a card and everything in it.',
  insertNode: 'Insert a block or layout container at a location.',
  updateNode: 'Change some fields of an existing block or container (shallow merge).',
  replaceNode:
    'Replace a node with a different one (may change its type). Keeps the old id unless the new node sets one.',
  moveNode: 'Move a node to another location, possibly in another card.',
  deleteNode: 'Delete a block or container (and its children).',
  wrapNodes:
    'Wrap adjacent sibling nodes in a new stack, columns or grid container. For columns, each node becomes one column.',
  unwrapNode: 'Remove a container and put its children in its place.',
  insertColumn: 'Add an empty column to a columns container (max 4).',
  deleteColumn:
    'Remove a column from a columns container (min 2). Its nodes are deleted unless moveNodesTo is given.',
};

const VALID_COMMANDS: unknown[] = [
  { op: 'setTitle', title: 'Introduction to Photosynthesis' },
  { op: 'setFormat', format: 'document' },
  { op: 'setFormat', format: 'presentation' },
  { op: 'setTheme', preset: 'dark' },
  { op: 'setTheme', preset: 'serif', overrides: { fontBody: 'sans', colorAccent: '#d4a017' } },
  { op: 'setTheme', overrides: { colorPrimary: null } },
  {
    op: 'putAsset',
    asset: { kind: 'image', src: 'https://example.com/new-leaf.png', alt: 'Leaf' },
  },
  {
    op: 'putAsset',
    id: 'img_http',
    asset: { kind: 'image', src: 'http://example.com/diagram.png' },
  },
  {
    op: 'putAsset',
    id: 'img_inline',
    asset: { kind: 'image', src: 'data:image/png;base64,aaaa', alt: 'Inline pixel' },
  },
  { op: 'removeAsset', id: 'img_spare' },
  { op: 'insertCard' },
  {
    op: 'insertCard',
    at: { index: 0 },
    card: { body: [{ type: 'paragraph', text: 'A new opening.' }] },
  },
  {
    op: 'insertCard',
    at: { before: 'c_process' },
    card: {
      notes: 'A nested layout.',
      body: [
        { type: 'heading', level: 2, text: 'Two ways in' },
        {
          type: 'stack',
          gap: 'md',
          children: [
            {
              type: 'columns',
              widths: [1, 1],
              gap: 'sm',
              align: 'start',
              children: [
                [{ type: 'paragraph', text: 'Left column' }],
                [{ type: 'list', style: 'bullet', items: ['One', 'Two'] }],
              ],
            },
            { type: 'grid', columns: 2, children: [{ type: 'quote', text: 'Short quote' }] },
          ],
        },
      ],
    },
  },
  {
    op: 'insertCard',
    at: { after: 'c_title' },
    card: {
      notes: 'Accent slide',
      accent: { position: 'left', assetId: 'img_leaf' },
      background: { kind: 'color', value: '#ffffff' },
      body: [{ id: 'b_fresh', type: 'heading', level: 1, text: 'Fresh card' }],
    },
  },
  { op: 'updateCard', id: 'c_title', patch: { notes: 'Pause after the title.' } },
  {
    op: 'updateCard',
    id: 'c_title',
    patch: { accent: null, background: { kind: 'color', value: '#112233' } },
  },
  {
    op: 'updateCard',
    id: 'c_inside',
    patch: {
      background: { kind: 'gradient', from: '#e7f5ea', to: '#fff6d8', angle: 90 },
    },
  },
  { op: 'moveCard', id: 'c_review', to: { before: 'c_title' } },
  { op: 'moveCard', id: 'c_inside', to: { index: 0 } },
  { op: 'duplicateCard', id: 'c_title' },
  { op: 'duplicateCard', id: 'c_process', newId: 'c_process_copy' },
  { op: 'splitCard', id: 'c_title', atNodeId: 'b_lead' },
  { op: 'splitCard', id: 'c_title', atNodeId: 'b_quote', newId: 'c_title_rest' },
  { op: 'deleteCard', id: 'c_review' },
  {
    op: 'insertNode',
    node: { type: 'paragraph', text: 'A quiet aside.', align: 'center' },
    at: { before: 'b_lead' },
  },
  {
    op: 'insertNode',
    node: { type: 'heading', level: 2, text: 'One more question' },
    at: { parent: 'c_review' },
  },
  {
    op: 'insertNode',
    node: {
      type: 'stack',
      gap: 'sm',
      children: [
        { type: 'heading', level: 3, text: 'Nested' },
        {
          type: 'columns',
          widths: [1.2, 1],
          children: [
            [{ type: 'paragraph', text: 'Detail' }],
            [{ type: 'callout', tone: 'note', text: 'Remember this.' }],
          ],
        },
      ],
    },
    at: { after: 'b_equation' },
  },
  {
    op: 'insertNode',
    node: {
      type: 'image',
      assetId: 'img_leaf',
      fit: 'contain',
      width: 'auto',
      caption: 'The same leaf again.',
    },
    at: { parent: 'c_title', index: 1 },
  },
  {
    op: 'insertNode',
    node: {
      type: 'list',
      style: 'check',
      items: ['Plain', { text: 'Parent', checked: false, children: ['Child'] }],
    },
    at: { after: 'b_answers' },
  },
  {
    op: 'insertNode',
    node: {
      type: 'table',
      header: true,
      rows: [
        ['Gas', 'Role'],
        ['CO2', 'Input'],
      ],
    },
    at: { parent: 'c_inside' },
  },
  {
    op: 'insertNode',
    node: { type: 'callout', tone: 'success', text: 'Oxygen is the leftover.' },
    at: { parent: 'n_organelles' },
  },
  {
    op: 'insertNode',
    node: { type: 'code', language: 'text', code: 'light -> sugar' },
    at: { after: 'b_equation' },
  },
  {
    op: 'insertNode',
    node: {
      type: 'grid',
      columns: 3,
      gap: 'md',
      children: [
        { type: 'paragraph', text: 'One' },
        { type: 'paragraph', text: 'Two' },
        { type: 'divider' },
      ],
    },
    at: { parent: 'c_review', index: 0 },
  },
  {
    op: 'insertNode',
    node: { type: 'paragraph', text: 'Into the left column.' },
    at: { parent: 'n_process_columns', slot: 0, index: 0 },
  },
  { op: 'updateNode', id: 'b_title', patch: { text: 'Photosynthesis, briefly' } },
  { op: 'updateNode', id: 'b_lead', patch: { align: null } },
  { op: 'updateNode', id: 'n_process_stack', patch: { gap: 'lg' } },
  {
    op: 'replaceNode',
    id: 'b_rule',
    node: { type: 'paragraph', text: 'A pause in the argument.' },
  },
  { op: 'moveNode', id: 'b_equation', to: { parent: 'c_review', index: 0 } },
  { op: 'moveNode', id: 'b_quote', to: { before: 'b_lead' } },
  { op: 'deleteNode', id: 'b_answers' },
  {
    op: 'wrapNodes',
    ids: ['b_title', 'b_lead'],
    container: { type: 'stack', gap: 'sm' },
  },
  {
    op: 'wrapNodes',
    ids: ['b_question', 'b_answers'],
    container: { type: 'columns', widths: [1, 1], gap: 'md', align: 'stretch' },
  },
  {
    op: 'wrapNodes',
    ids: ['b_review_heading', 'b_question'],
    container: { type: 'grid', columns: 2 },
  },
  { op: 'unwrapNode', id: 'n_process_stack' },
  { op: 'unwrapNode', id: 'n_organelles' },
  { op: 'insertColumn', id: 'n_process_columns', index: 2, width: 1.5 },
  { op: 'deleteColumn', id: 'n_process_columns', index: 2, moveNodesTo: 0 },
];

const INVALID_COMMANDS: unknown[] = [
  { op: 'explode', title: 'nope' },
  { op: 'setTitle' },
  { op: 'setFormat', format: 'poster' },
  { op: 'setTheme', preset: 'neon' },
  { op: 'setTheme' },
  { op: 'deleteCard' },
  { op: 'setFormat' },
  { op: 'updateNode', id: 'b_title', patch: {} },
  { op: 'updateCard', id: 'c_title', patch: {} },
  { op: 'updateNode', id: 'b_title', patch: { id: 'b_other' } },
  { op: 'updateNode', id: 'b_title', patch: { type: 'heading' } },
  { op: 'updateNode', id: 'n_process_stack', patch: { children: [] } },
  { op: 'deleteNode', id: '1bad' },
  {
    op: 'insertNode',
    node: { type: 'heading', level: 4, text: 'Too deep' },
    at: { parent: 'c_title' },
  },
  {
    op: 'insertNode',
    node: { type: 'heading', level: '2', text: 'Not a number' },
    at: { parent: 'c_title' },
  },
  {
    op: 'updateCard',
    id: 'c_title',
    patch: { background: { kind: 'color', value: 'red' } },
  },
  { op: 'putAsset', asset: { kind: 'image', src: 'javascript:alert(1)' } },
  { op: 'putAsset', asset: { kind: 'image', src: 'data:text/html,hi' } },
  {
    op: 'insertNode',
    node: { type: 'paragraph', text: 'Where?' },
    at: { before: 'b_title', after: 'b_lead' },
  },
  { op: 'moveCard', id: 'c_title', to: { before: 'c_process', after: 'c_inside' } },
  {
    op: 'insertNode',
    node: {
      type: 'columns',
      widths: [1],
      children: [[{ type: 'paragraph', text: 'Only one' }]],
    },
    at: { parent: 'c_title' },
  },
  {
    op: 'insertNode',
    node: { type: 'unknown', raw: { type: 'audio' } },
    at: { parent: 'c_title' },
  },
  { op: 'updateCard', id: 'c_title', patch: { notes: 'ok', title: 'nope' } },
  { op: 'insertNode', node: { type: 'paragraph', text: 'Missing location' } },
  { op: 'wrapNodes', ids: [], container: { type: 'stack' } },
  {
    op: 'insertNode',
    node: { type: 'grid', columns: 5, children: [] },
    at: { parent: 'c_title' },
  },
  {
    op: 'insertNode',
    node: { type: 'callout', tone: 'panic', text: 'Nope' },
    at: { parent: 'c_title' },
  },
  {
    op: 'insertNode',
    node: { type: 'table', rows: [] },
    at: { parent: 'c_title' },
  },
  {
    op: 'insertNode',
    node: { type: 'code', language: 'x'.repeat(33), code: '1' },
    at: { parent: 'c_title' },
  },
  {
    op: 'insertNode',
    node: { type: 'paragraph', align: 'justify', text: 'No' },
    at: { parent: 'c_title' },
  },
  {
    op: 'insertNode',
    node: { type: 'list', style: 'roman', items: ['No'] },
    at: { parent: 'c_title' },
  },
  { op: 'putAsset', asset: { kind: 'image' } },
  { op: 'insertColumn', id: 'n_process_columns', width: 0 },
  { op: 'setTitle', title: 'Hello', extra: true },
  {
    op: 'insertNode',
    node: { type: 'image', fit: 'cover' },
    at: { parent: 'c_title' },
  },
  { op: 'moveNode', id: 'b_lead', to: { parent: 'c_review', before: 'b_question' } },
  { op: 'moveCard', id: 'c_title', to: { index: -1 } },
  { op: 'deleteColumn', id: 'n_process_columns' },
  {
    op: 'insertNode',
    node: { type: 'quote', text: 'Hi', cite: 12 },
    at: { parent: 'c_title' },
  },
  {
    op: 'insertNode',
    node: { type: 'stack', gap: 'xl', children: [] },
    at: { parent: 'c_title' },
  },
];

const COLOR_SAMPLES: Array<[string, boolean]> = [
  ['#abc', true],
  ['#AABBCC', true],
  ['#ab', false],
  ['rgb(0, 0, 0)', true],
  ['RGB(255,128,0)', true],
  ['rgb(00, 0, 0)', true],
  ['rgb(256, 0, 0)', false],
  ['rgb(0, 0, 0, 1)', false],
  ['hsl(360, 100%, 50%)', true],
  ['hsl(0,0%,0%)', true],
  ['HSL(180, 50%, 50%)', true],
  ['hsl(361, 0%, 0%)', false],
  ['hsl(10, 101%, 0%)', false],
  ['red', false],
  ['#gg0000', false],
  ['#fff', true],
  ['rgb( 10 , 20 , 30 )', true],
  ['hsl(10, 10%, 10%)', true],
  ['#ffff', false],
  ['', false],
];

function opOf(command: unknown): string {
  if (command && typeof command === 'object' && 'op' in command) return String(command.op);
  return '?';
}

function freshDocument(): LoomaDocument {
  const parsed = parseDocument(cloneJson(fixture));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

function documentFor(command: unknown): LoomaDocument {
  const doc = freshDocument();
  if (opOf(command) === 'removeAsset') {
    doc.assets.img_spare = {
      kind: 'image',
      src: 'https://example.com/spare.png',
      alt: 'Spare',
    };
  }
  if (opOf(command) === 'deleteColumn') {
    const found = findNode(doc, 'n_process_columns');
    if (!found || found.node.type !== 'columns') throw new Error('fixture columns missing');
    found.node.children.push([]);
    found.node.widths.push(1);
  }
  return doc;
}

function compile(schema: JsonSchema) {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  return ajv.compile(schema);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walk(schema: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(schema)) {
    for (const item of schema) walk(item, visit);
    return;
  }
  if (!isRecord(schema)) return;
  visit(schema);
  for (const value of Object.values(schema)) walk(value, visit);
}

function findColorPattern(schema: unknown): string | undefined {
  let pattern: string | undefined;
  walk(schema, (node) => {
    if (pattern) return;
    if (node.description === COLOR_DESCRIPTION && typeof node.pattern === 'string') {
      pattern = node.pattern;
    }
  });
  return pattern;
}

function stripIdsAndVersion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripIdsAndVersion(item));
  if (!isRecord(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'id' || key === 'looma') continue;
    copy[key] = stripIdsAndVersion(child);
  }
  return copy;
}

describe('JSON Schema generation', () => {
  const commandSchema = getCommandJsonSchema();
  const documentSchema = getDocumentJsonSchema();
  const validateCommand = compile(commandSchema);
  const validateDocument = compile(documentSchema);

  it('compiles the command and document schemas', () => {
    expect(validateCommand).toEqual(expect.any(Function));
    expect(validateDocument).toEqual(expect.any(Function));
  });

  it('accepts every valid command in Ajv, zod, and applyCommands', () => {
    expect(VALID_COMMANDS.length).toBeGreaterThanOrEqual(30);
    const covered = new Set(VALID_COMMANDS.map((command) => opOf(command)));
    expect([...covered].sort()).toEqual([...COMMAND_OPS].sort());

    for (const command of VALID_COMMANDS) {
      const label = JSON.stringify(command);
      expect(validateCommand(command), label).toBe(true);
      expect(LoomaCommandSchema.safeParse(command).success, label).toBe(true);
      const applied = applyCommands(documentFor(command), [command]);
      expect(applied.ok, `${label} ${JSON.stringify(applied)}`).toBe(true);
    }
  });

  it('rejects invalid commands that the schema can see', () => {
    expect(INVALID_COMMANDS.length).toBeGreaterThanOrEqual(20);
    const accepted = INVALID_COMMANDS.filter((command) => validateCommand(command));
    expect(accepted).toEqual([]);
  });

  it('rejects refinements the runtime also rejects', () => {
    const doc = freshDocument();
    const cases = [
      { op: 'setTheme' },
      { op: 'deleteCard' },
      { op: 'updateNode', id: 'b_title', patch: {} },
      { op: 'updateCard', id: 'c_title', patch: {} },
      { op: 'updateNode', id: 'b_title', patch: { id: 'b_other' } },
      { op: 'updateNode', id: 'b_title', patch: { type: 'heading' } },
      { op: 'updateNode', id: 'n_process_stack', patch: { children: [] } },
    ];
    for (const command of cases) {
      const label = JSON.stringify(command);
      expect(validateCommand(command), label).toBe(false);
      const applied = applyCommands(doc, [command]);
      expect(applied.ok, label).toBe(false);
    }
  });

  it('requires the same top-level fields the runtime requires', () => {
    const doc = freshDocument();
    const variants = commandSchema.anyOf;
    expect(Array.isArray(variants)).toBe(true);
    for (const op of COMMAND_OPS) {
      const applied = applyCommands(doc, [{ op }]);
      const paths = applied.ok
        ? []
        : applied.errors.map((error) => error.path).filter((path) => !path.includes('.'));
      const variant = (variants as JsonSchema[]).find((branch) => {
        const properties = branch.properties;
        return isRecord(properties) && isRecord(properties.op) && properties.op.const === op;
      });
      const required = Array.isArray(variant?.required) ? [...variant.required].sort() : [];
      // setTheme's refine reports path `preset`, but either preset or overrides is enough.
      if (op === 'setTheme') {
        expect(required, op).toEqual(['op']);
        expect(variant?.anyOf).toEqual([{ required: ['preset'] }, { required: ['overrides'] }]);
        continue;
      }
      expect(required, op).toEqual(['op', ...paths].sort());
    }
  });

  it('accepts a fixture document with every id and looma omitted', () => {
    const stripped = stripIdsAndVersion(fixture);
    expect(validateDocument(stripped), JSON.stringify(validateDocument.errors)).toBe(true);
    const parsed = parseDocument(stripped);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });

  it('uses anyOf, drops unknown blocks, and omits id on created objects', () => {
    for (const schema of [commandSchema, documentSchema]) {
      const json = JSON.stringify(schema);
      expect(json).not.toContain('oneOf');
      expect(json).not.toContain('"unknown"');
    }
    const defs = commandSchema.$defs;
    expect(isRecord(defs)).toBe(true);
    for (const name of ['LoomaNode', 'LoomaCard']) {
      walk(isRecord(defs) ? defs[name] : undefined, (node) => {
        if (!Array.isArray(node.required)) return;
        expect(node.required, name).not.toContain('id');
      });
    }
    walk(documentSchema, (node) => {
      if (!Array.isArray(node.required)) return;
      expect(node.required).not.toContain('id');
    });
  });

  it('stays small enough to send to a model', () => {
    const length = JSON.stringify(getCommandJsonSchema()).length;
    const writer = (globalThis as { console?: { log: (message: string) => void } }).console;
    writer?.log(`getCommandJsonSchema length ${length}`);
    expect(length).toBeLessThan(40000);
  });

  it('describes colors with a pattern equivalent to isCssColor', () => {
    const pattern = findColorPattern(documentSchema);
    expect(pattern).toEqual(expect.any(String));
    const color = new RegExp(pattern ?? '');
    expect(COLOR_SAMPLES).toHaveLength(20);
    for (const [sample, expected] of COLOR_SAMPLES) {
      expect(color.test(sample), sample).toBe(expected);
      expect(isCssColor(sample), sample).toBe(expected);
    }
  });

  it('describes each command and the document version', () => {
    const variants = commandSchema.anyOf;
    expect(Array.isArray(variants)).toBe(true);
    for (const op of COMMAND_OPS) {
      const variant = (variants as JsonSchema[]).find((branch) => {
        const properties = branch.properties;
        if (!isRecord(properties)) return false;
        const opSchema = properties.op;
        return isRecord(opSchema) && opSchema.const === op;
      });
      expect(variant?.description, op).toBe(COMMAND_DESCRIPTIONS[op]);
    }
    const update = (variants as JsonSchema[]).find((branch) => {
      const properties = branch.properties;
      return (
        isRecord(properties) && isRecord(properties.op) && properties.op.const === 'updateNode'
      );
    });
    const patch = isRecord(update?.properties) ? update.properties.patch : undefined;
    expect(isRecord(patch) ? patch.description : undefined).toBe(PATCH_DESCRIPTION);

    const properties = documentSchema.properties;
    const looma = isRecord(properties) ? properties.looma : undefined;
    expect(isRecord(looma) ? looma.description : undefined).toBe(LOOMA_DESCRIPTION);
    expect(documentSchema.required ?? []).not.toContain('looma');
  });

  it('returns a deep copy that callers can mutate', () => {
    const firstCommand = getCommandJsonSchema();
    const secondCommand = getCommandJsonSchema();
    expect(firstCommand).toEqual(secondCommand);
    expect(firstCommand).not.toBe(secondCommand);
    firstCommand.$schema = 'mutated';
    expect(secondCommand.$schema).not.toBe('mutated');

    const firstDocument = getDocumentJsonSchema();
    const secondDocument = getDocumentJsonSchema();
    expect(firstDocument).toEqual(secondDocument);
    expect(firstDocument).not.toBe(secondDocument);
    const defs = firstDocument.$defs;
    if (isRecord(defs)) defs.LoomaNode = { mutated: true };
    expect(isRecord(secondDocument.$defs) ? secondDocument.$defs.LoomaNode : undefined).not.toEqual(
      {
        mutated: true,
      },
    );
  });
});
