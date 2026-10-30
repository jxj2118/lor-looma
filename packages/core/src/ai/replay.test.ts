import { afterAll, describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import { cloneJson } from '../parse/repair';
import { getOutline } from '../read';
import { createLoomaStore } from '../store';
import type { LoomaDocument } from '../schema';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { createToolHandler } from './handler';

declare global {
  interface ImportMeta {
    glob(pattern: string, options: { eager: true }): Record<string, unknown>;
  }
}

interface StepExpect {
  ok: boolean;
  createdIdsCount?: number;
  errorIncludes?: string[];
  outlineCardCount?: number;
  missing?: string[];
}

interface SessionStep {
  tool: string;
  args: unknown;
  expect: StepExpect;
}

interface Session {
  name: string;
  description: string;
  initial: 'empty' | 'fixture';
  steps: SessionStep[];
  final: { cardCount: number; undoSteps: number };
}

const sessionModules = import.meta.glob('./sessions/*.json', { eager: true });

function asSession(mod: unknown): Session {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    return (mod as { default: Session }).default;
  }
  return mod as Session;
}

const sessions = Object.entries(sessionModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, mod]) => asSession(mod));

const cryptoApi = crypto as {
  getRandomValues: (array: Uint8Array) => Uint8Array;
};
const randomValues = cryptoApi.getRandomValues.bind(crypto);

function deterministicIds(): void {
  let seed = 0;
  cryptoApi.getRandomValues = (array) => {
    for (let index = 0; index < array.length; index += 1) {
      seed = (seed + 17) % 256;
      array[index] = seed;
    }
    return array;
  };
}

function emptyDocument(): LoomaDocument {
  const parsed = parseDocument({ looma: 1, id: 'doc_session', title: '', cards: [] });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

function fixtureDocument(): LoomaDocument {
  const parsed = parseDocument(cloneJson(fixture));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fields(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

describe('AI session replay', () => {
  it('replays every session fixture', () => {
    expect(sessions.map((session) => session.name)).toEqual([
      'build-deck-from-empty',
      'edit-existing-deck',
      'recover-from-errors',
      'layout-theme-assets',
      'read-then-edit-markdown',
    ]);
  });

  it.each(sessions)('$name', (session) => {
    deterministicIds();
    expect(session.description.length).toBeGreaterThan(0);
    const store = createLoomaStore(
      session.initial === 'empty' ? emptyDocument() : fixtureDocument(),
    );
    const handler = createToolHandler(store);

    for (const step of session.steps) {
      const before = store.getDocument();
      const result = handler(step.tool, step.args);
      expect(result.ok, JSON.stringify(result)).toBe(step.expect.ok);
      if (!step.expect.ok) expect(store.getDocument()).toBe(before);

      if (step.expect.createdIdsCount !== undefined) {
        const created = fields(result)?.createdIds;
        expect(Array.isArray(created) ? created.length : -1).toBe(step.expect.createdIdsCount);
      }
      if (step.expect.errorIncludes) {
        const error = fields(result)?.error;
        const text = typeof error === 'string' ? error : '';
        for (const part of step.expect.errorIncludes) expect(text).toContain(part);
      }
      if (step.expect.outlineCardCount !== undefined) {
        const outline = fields(result)?.outline;
        const cardCount =
          isRecord(outline) && typeof outline.cardCount === 'number' ? outline.cardCount : -1;
        expect(cardCount).toBe(step.expect.outlineCardCount);
      }
      if (step.expect.missing) {
        expect(fields(result)?.missing).toEqual(step.expect.missing);
        if (step.expect.missing.length > 0) {
          expect(typeof fields(result)?.hint).toBe('string');
        }
      }
    }

    expect(store.getDocument().cards.length).toBe(session.final.cardCount);
    expect(getOutline(store.getDocument())).toMatchSnapshot();
    let undoSteps = 0;
    while (store.undo()) undoSteps += 1;
    expect(undoSteps).toBe(session.final.undoSteps);
  });
});

afterAll(() => {
  cryptoApi.getRandomValues = randomValues;
});
