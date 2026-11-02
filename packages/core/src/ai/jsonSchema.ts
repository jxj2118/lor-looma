import { z } from 'zod';
import { LoomaCommandSchema } from '../commands/schema';
import type { CommandOp } from '../commands/schema';
import { ID_PATTERN } from '../ids';
import { LoomaAssetSchema, LoomaCardSchema, LoomaDocumentSchema, LoomaNodeSchema } from '../schema';

export type JsonSchema = Record<string, unknown>;

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const COLOR_DESCRIPTION = 'CSS color: #rgb, #rrggbb, rgb(r, g, b) or hsl(h, s%, l%)';
const PATCH_DESCRIPTION =
  'Fields to change on the node. Same field names as the node type; null removes an optional field. Cannot contain id, type or children.';
const LOOMA_DESCRIPTION = 'Schema version. Always 1.';
const IMAGE_SRC_PATTERN = '^(?:[hH][tT][tT][pP][sS]?://|[dD][aA][tT][aA]:[iI][mM][aA][gG][eE]/)';

const BYTE = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|0\\d\\d|\\d{1,2})';
const HUE = '(?:360|3[0-5]\\d|[0-2]\\d\\d|\\d{1,2})';
const PCT = '(?:100|0\\d\\d|\\d{1,2})';
const SP = '\\s*';
const CSS_COLOR_PATTERN = `^(?:#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})|[rR][gG][bB]\\(${SP}${BYTE}${SP},${SP}${BYTE}${SP},${SP}${BYTE}${SP}\\)|[hH][sS][lL]\\(${SP}${HUE}${SP},${SP}${PCT}%${SP},${SP}${PCT}%${SP}\\))$`;

const COLOR_PROPERTIES = new Set([
  'colorBg',
  'colorFg',
  'colorMuted',
  'colorPrimary',
  'colorAccent',
  'colorInfo',
  'colorSuccess',
  'colorWarning',
  'colorDanger',
  'colorNote',
  'cardBackground',
  'from',
  'to',
]);

const COMMAND_DESCRIPTIONS: Record<CommandOp, string> = {
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
    'Wrap adjacent sibling nodes in a new stack, columns, grid or steps container. For columns, each node becomes one column.',
  unwrapNode: 'Remove a container and put its children in its place.',
  insertColumn: 'Add an empty column to a columns container (max 4).',
  deleteColumn:
    'Remove a column from a columns container (min 2). Its nodes are deleted unless moveNodesTo is given.',
};

const JSON_SCHEMA_OPTIONS = {
  io: 'input',
  target: 'draft-2020-12',
  cycles: 'ref',
  unrepresentable: 'any',
} as const;

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneSchema<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toInputSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, JSON_SCHEMA_OPTIONS) as JsonSchema;
}

function typeConst(schema: JsonSchema): unknown {
  const properties = schema.properties;
  if (!isSchema(properties)) return undefined;
  const type = properties.type;
  if (!isSchema(type)) return undefined;
  return type.const;
}

function isUnknownBlock(branch: unknown): boolean {
  return isSchema(branch) && typeConst(branch) === 'unknown';
}

function kindConst(properties: JsonSchema): unknown {
  const kind = properties.kind;
  if (!isSchema(kind)) return undefined;
  return kind.const;
}

/**
 * Recursive cleanup applied to every generated schema object.
 * `omitCreatedIds` drops `id` from `required` only for objects being created
 * (nodes, cards, the document). Command arguments that address existing ids stay required.
 */
function postProcess(schema: JsonSchema, isRoot = false, omitCreatedIds = false): void {
  for (const key of Object.keys(schema)) {
    if (key.startsWith('~')) delete schema[key];
    if (key === '$schema' && !isRoot) delete schema[key];
  }

  if (Array.isArray(schema.oneOf)) {
    const existing = Array.isArray(schema.anyOf) ? schema.anyOf : [];
    schema.anyOf = [...existing, ...schema.oneOf];
    delete schema.oneOf;
  }

  if (Array.isArray(schema.anyOf)) {
    schema.anyOf = schema.anyOf.filter((branch) => !isUnknownBlock(branch));
  }

  if (omitCreatedIds && Array.isArray(schema.required)) {
    const required = schema.required.filter((key) => key !== 'id');
    if (required.length === 0) delete schema.required;
    else schema.required = required;
  }

  const properties = schema.properties;
  if (isSchema(properties)) {
    for (const [name, prop] of Object.entries(properties)) {
      if (!isSchema(prop) || prop.type !== 'string') continue;
      if (name === 'id') prop.pattern = ID_PATTERN.source;
      if (name === 'src') prop.pattern = IMAGE_SRC_PATTERN;
      const namedColor = COLOR_PROPERTIES.has(name);
      const colorValue = name === 'value' && kindConst(properties) === 'color';
      if (namedColor || colorValue) {
        prop.pattern = CSS_COLOR_PATTERN;
        prop.description = COLOR_DESCRIPTION;
      }
    }
  }

  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isSchema(item)) postProcess(item, false, omitCreatedIds);
      }
    } else if (isSchema(value)) {
      postProcess(value, false, omitCreatedIds);
    }
  }
}

function rewriteRefs(schema: unknown, map: ReadonlyMap<string, string>): void {
  if (Array.isArray(schema)) {
    for (const item of schema) rewriteRefs(item, map);
    return;
  }
  if (!isSchema(schema)) return;
  if (typeof schema.$ref === 'string') {
    const next = map.get(schema.$ref);
    if (next) schema.$ref = next;
  }
  for (const value of Object.values(schema)) rewriteRefs(value, map);
}

interface NodeDefs {
  LoomaNode: JsonSchema;
  ListItem: JsonSchema;
}

/**
 * Zod names recursive pieces `__schema0` and points a cycle at `#`.
 * Both are renamed so a model, and a schema that embeds the node, can refer to them.
 */
function nodeDefs(): NodeDefs {
  const raw = toInputSchema(LoomaNodeSchema);
  postProcess(raw, true, true);
  const defs = raw.$defs;
  if (!isSchema(defs)) throw new Error('node schema is missing $defs');
  const listKey = Object.keys(defs)[0];
  const listItem = listKey ? defs[listKey] : undefined;
  if (!listKey || !isSchema(listItem) || !Array.isArray(raw.anyOf)) {
    throw new Error('node schema did not produce a list-item $def');
  }
  delete raw.$defs;
  delete raw.$schema;
  const refs = new Map<string, string>([
    ['#', '#/$defs/LoomaNode'],
    [`#/$defs/${listKey}`, '#/$defs/ListItem'],
  ]);
  rewriteRefs(raw, refs);
  rewriteRefs(listItem, refs);
  return { LoomaNode: raw, ListItem: listItem };
}

function cardDef(): JsonSchema {
  const raw = toInputSchema(LoomaCardSchema);
  postProcess(raw, true, true);
  delete raw.$schema;
  delete raw.$defs;
  const properties = raw.properties;
  if (!isSchema(properties) || !isSchema(properties.body)) {
    throw new Error('card schema is missing body');
  }
  properties.body.items = { $ref: '#/$defs/LoomaNode' };
  return raw;
}

function assetDef(): JsonSchema {
  const raw = toInputSchema(LoomaAssetSchema);
  postProcess(raw, true);
  delete raw.$schema;
  return raw;
}

function containerShells(node: JsonSchema): JsonSchema[] {
  if (!Array.isArray(node.anyOf)) throw new Error('node schema is missing anyOf');
  const shells: JsonSchema[] = [];
  for (const branch of node.anyOf) {
    if (!isSchema(branch)) continue;
    const type = typeConst(branch);
    if (type !== 'stack' && type !== 'columns' && type !== 'grid' && type !== 'steps') continue;
    const shell = cloneSchema(branch);
    const properties = shell.properties;
    if (isSchema(properties)) delete properties.children;
    if (Array.isArray(shell.required)) {
      const required = shell.required.filter((key) => key !== 'children');
      if (required.length === 0) delete shell.required;
      else shell.required = required;
    }
    shells.push(shell);
  }
  return shells;
}

function opOf(variant: JsonSchema): CommandOp | undefined {
  const properties = variant.properties;
  if (!isSchema(properties) || !isSchema(properties.op)) return undefined;
  const op = properties.op.const;
  if (typeof op !== 'string') return undefined;
  if (!Object.prototype.hasOwnProperty.call(COMMAND_DESCRIPTIONS, op)) return undefined;
  return op as CommandOp;
}

function buildCommandSchema(): JsonSchema {
  const { LoomaNode, ListItem } = nodeDefs();
  const LoomaCard = cardDef();
  const LoomaAsset = assetDef();
  const shells = containerShells(LoomaNode);
  const raw = toInputSchema(LoomaCommandSchema);
  postProcess(raw, true);
  if (!Array.isArray(raw.anyOf)) throw new Error('command schema is missing anyOf');

  for (const variant of raw.anyOf) {
    if (!isSchema(variant)) continue;
    const op = opOf(variant);
    if (!op || !isSchema(variant.properties)) continue;
    variant.description = COMMAND_DESCRIPTIONS[op];
    const properties = variant.properties;
    if (op === 'insertNode' || op === 'replaceNode') {
      properties.node = { $ref: '#/$defs/LoomaNode' };
    } else if (op === 'insertCard') {
      properties.card = { $ref: '#/$defs/LoomaCard' };
    } else if (op === 'wrapNodes') {
      properties.container = { anyOf: shells.map((shell) => cloneSchema(shell)) };
    } else if (op === 'setTheme') {
      variant.anyOf = [{ required: ['preset'] }, { required: ['overrides'] }];
    } else if (op === 'updateNode' && isSchema(properties.patch)) {
      properties.patch.description = PATCH_DESCRIPTION;
      properties.patch.minProperties = 1;
      properties.patch.propertyNames = { not: { enum: ['id', 'type', 'children'] } };
    } else if (op === 'updateCard' && isSchema(properties.patch)) {
      properties.patch.minProperties = 1;
    } else if (op === 'putAsset') {
      properties.asset = { $ref: '#/$defs/LoomaAsset' };
    }
  }

  return {
    $schema: DRAFT,
    anyOf: raw.anyOf,
    $defs: { LoomaNode, ListItem, LoomaCard, LoomaAsset },
  };
}

function buildDocumentSchema(): JsonSchema {
  const { LoomaNode, ListItem } = nodeDefs();
  const LoomaCard = cardDef();
  const LoomaAsset = assetDef();
  const raw = toInputSchema(LoomaDocumentSchema);
  postProcess(raw, true, true);
  if (Array.isArray(raw.required)) {
    const required = raw.required.filter((key) => key !== 'looma' && key !== 'id');
    if (required.length === 0) delete raw.required;
    else raw.required = required;
  }
  const properties = raw.properties;
  if (isSchema(properties)) {
    if (isSchema(properties.looma)) properties.looma.description = LOOMA_DESCRIPTION;
    if (isSchema(properties.cards)) properties.cards.items = { $ref: '#/$defs/LoomaCard' };
    if (isSchema(properties.assets)) {
      properties.assets.additionalProperties = { $ref: '#/$defs/LoomaAsset' };
    }
  }
  delete raw.$defs;
  raw.$schema = DRAFT;
  raw.$defs = { LoomaNode, ListItem, LoomaCard, LoomaAsset };
  return raw;
}

let commandSchema: JsonSchema | undefined;
let documentSchema: JsonSchema | undefined;

/** JSON Schema (draft 2020-12) for one Looma command. Ids on created nodes and cards are optional; ids that address existing objects stay required. */
export function getCommandJsonSchema(): JsonSchema {
  commandSchema ??= buildCommandSchema();
  return cloneSchema(commandSchema);
}

/** JSON Schema (draft 2020-12) for a whole document as a model would write it: every id is optional. */
export function getDocumentJsonSchema(): JsonSchema {
  documentSchema ??= buildDocumentSchema();
  return cloneSchema(documentSchema);
}
