import { describe, expect, it } from 'vitest';
import { formatIssue, parseDocument } from '../parse';
import type { LoomaDocument } from '../schema';
import { createLoomaStore } from './createLoomaStore';

function document(): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_1',
    title: 'Demo',
    cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'paragraph', text: 'One' }] }],
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

function invalidMessage(input: unknown): string {
  const parsed = parseDocument(input, { repair: false });
  if (parsed.ok) throw new Error('expected an invalid document');
  return `Invalid Looma document:\n${parsed.errors.map((issue) => formatIssue(issue)).join('\n')}`;
}

describe('createLoomaStore', () => {
  it('undoes and redoes an apply back to the same document contents', () => {
    const store = createLoomaStore(document());
    const initial = store.getDocument();
    store.apply([{ op: 'setTitle', title: 'Next' }]);
    const changed = store.getDocument();
    expect(changed.title).toBe('Next');
    expect(store.undo()).toBe(true);
    expect(store.getDocument()).toEqual(initial);
    expect(store.redo()).toBe(true);
    expect(store.getDocument()).toEqual(changed);
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(false);
    expect(store.canUndo()).toBe(false);
  });

  it('ignores a failed apply', () => {
    const store = createLoomaStore(document());
    const current = store.getDocument();
    const changes: string[] = [];
    store.subscribe(() => {
      changes.push('called');
    });
    const result = store.apply([{ op: 'deleteCard', id: 'missing' }]);
    expect(result.ok).toBe(false);
    expect(store.canUndo()).toBe(false);
    expect(store.getDocument()).toBe(current);
    expect(changes).toEqual([]);
  });

  it('does not record an apply that changes nothing', () => {
    const store = createLoomaStore(document());
    const current = store.getDocument();
    const changes: string[] = [];
    store.subscribe(() => {
      changes.push('called');
    });
    const result = store.apply([{ op: 'setTitle', title: 'Demo' }]);
    expect(result.ok).toBe(true);
    expect(store.canUndo()).toBe(false);
    expect(store.getDocument()).toBe(current);
    expect(changes).toEqual([]);
  });

  it('merges applies that share a mergeKey inside the window', () => {
    let now = 0;
    const store = createLoomaStore(document(), { now: () => now, mergeWindowMs: 1000 });
    const kinds: string[] = [];
    store.subscribe((_doc, change) => {
      kinds.push(change.kind);
      if (change.kind === 'undo') expect(change.commands).toHaveLength(3);
    });
    store.apply([{ op: 'setTitle', title: 'A' }], { mergeKey: 'title' });
    now = 500;
    store.apply([{ op: 'setTitle', title: 'B' }], { mergeKey: 'title' });
    now = 1000;
    store.apply([{ op: 'setTitle', title: 'C' }], { mergeKey: 'title' });
    expect(store.getDocument().title).toBe('C');
    expect(store.undo()).toBe(true);
    expect(store.getDocument().title).toBe('Demo');
    expect(store.canUndo()).toBe(false);
    expect(kinds).toEqual(['apply', 'apply', 'apply', 'undo']);
  });

  it('starts a new history entry when the merge window or mergeKey changes', () => {
    let now = 0;
    const store = createLoomaStore(document(), { now: () => now });
    store.apply([{ op: 'setTitle', title: 'A' }], { mergeKey: 'title' });
    now = 1500;
    store.apply([{ op: 'setTitle', title: 'B' }], { mergeKey: 'title' });
    expect(store.undo()).toBe(true);
    expect(store.getDocument().title).toBe('A');
    expect(store.undo()).toBe(true);
    expect(store.getDocument().title).toBe('Demo');

    const other = createLoomaStore(document(), { now: () => 0 });
    other.apply([{ op: 'setTitle', title: 'A' }], { mergeKey: 'title' });
    other.apply([{ op: 'setTitle', title: 'B' }], { mergeKey: 'notes' });
    expect(other.undo()).toBe(true);
    expect(other.getDocument().title).toBe('A');
    expect(other.canUndo()).toBe(true);
  });

  it('does not merge with an entry that was followed by undo', () => {
    let now = 0;
    const store = createLoomaStore(document(), { now: () => now });
    store.apply([{ op: 'setTitle', title: 'A' }], { mergeKey: 'title' });
    now = 100;
    store.apply([{ op: 'setFormat', format: 'document' }], { mergeKey: 'format' });
    expect(store.undo()).toBe(true);
    now = 200;
    store.apply([{ op: 'setTitle', title: 'C' }], { mergeKey: 'title' });
    expect(store.undo()).toBe(true);
    expect(store.getDocument().title).toBe('A');
    expect(store.getDocument().format).toBe('presentation');
    expect(store.undo()).toBe(true);
    expect(store.getDocument().title).toBe('Demo');
  });

  it('clears the redo stack when a new apply is made', () => {
    const store = createLoomaStore(document());
    store.apply([{ op: 'setTitle', title: 'A' }]);
    expect(store.undo()).toBe(true);
    expect(store.canRedo()).toBe(true);
    store.apply([{ op: 'setTitle', title: 'B' }]);
    expect(store.canRedo()).toBe(false);
    expect(store.redo()).toBe(false);
    expect(store.getDocument().title).toBe('B');
  });

  it('drops history entries older than historyLimit', () => {
    const store = createLoomaStore(document(), { historyLimit: 3, now: () => 0 });
    for (const title of ['A', 'B', 'C', 'D']) {
      store.apply([{ op: 'setTitle', title }]);
    }
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(false);
    expect(store.getDocument().title).toBe('A');
  });

  it('reports apply, undo, redo, and load changes', () => {
    const store = createLoomaStore(document());
    const changes: {
      kind: string;
      origin: string;
      label?: string;
      touchedIds: readonly string[];
      removedIds: readonly string[];
      commands: readonly { op: string }[];
    }[] = [];
    store.subscribe((_doc, change) => {
      changes.push(change);
    });

    const insert = {
      op: 'insertNode' as const,
      node: { id: 'b_new', type: 'paragraph' as const, text: 'New' },
      at: { parent: 'c_1' },
    };
    store.apply([insert], { origin: 'ai', label: 'add' });
    expect(changes[0]).toMatchObject({
      kind: 'apply',
      origin: 'ai',
      label: 'add',
      touchedIds: ['b_new'],
      removedIds: [],
    });
    expect(changes[0]?.commands).toEqual([insert]);

    expect(store.undo()).toBe(true);
    expect(changes[1]).toMatchObject({
      kind: 'undo',
      origin: 'ai',
      label: 'add',
      removedIds: ['b_new'],
    });
    expect(changes[1]?.commands).toEqual([insert]);

    expect(store.redo()).toBe(true);
    expect(changes[2]).toMatchObject({
      kind: 'redo',
      origin: 'ai',
      touchedIds: ['b_new'],
      removedIds: [],
    });

    store.apply([{ op: 'deleteNode', id: 'b_1' }]);
    expect(store.undo()).toBe(true);
    const restored = changes[changes.length - 1];
    expect(restored?.kind).toBe('undo');
    expect(restored?.origin).toBe('user');
    expect(restored?.touchedIds).toContain('b_1');

    const loaded = parseDocument({ looma: 1, id: 'doc_2', title: 'Loaded', cards: [] });
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
    store.load(loaded.doc);
    expect(store.getDocument().id).toBe('doc_2');
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(changes[changes.length - 1]).toMatchObject({
      kind: 'load',
      origin: 'user',
      commands: [],
      touchedIds: [],
      removedIds: [],
    });
  });

  it('stops notifying a listener after it unsubscribes, even mid-notification', () => {
    const store = createLoomaStore(document());
    let second = 0;
    const stop = store.subscribe(() => {
      stop();
    });
    store.subscribe(() => {
      second += 1;
    });
    store.apply([{ op: 'setTitle', title: 'A' }]);
    store.apply([{ op: 'setTitle', title: 'B' }]);
    expect(second).toBe(2);
  });

  it('keeps notifying other listeners when one throws', () => {
    const store = createLoomaStore(document());
    const queued: Array<() => void> = [];
    const queue = globalThis as { queueMicrotask?: (callback: () => void) => void };
    const previous = queue.queueMicrotask;
    queue.queueMicrotask = (callback) => {
      queued.push(callback);
    };
    let second = 0;
    try {
      store.subscribe(() => {
        throw new Error('boom');
      });
      store.subscribe(() => {
        second += 1;
      });
      store.apply([{ op: 'setTitle', title: 'A' }]);
      expect(second).toBe(1);
      expect(queued).toHaveLength(1);
      expect(() => queued[0]?.()).toThrow('boom');
    } finally {
      queue.queueMicrotask = previous;
    }
  });

  it('rejects an invalid document and keeps a repaired unknown block', () => {
    const bad = { looma: 1 };
    expect(() => createLoomaStore(bad as LoomaDocument)).toThrow(
      new TypeError(invalidMessage(bad)),
    );
    expect(() => createLoomaStore(document()).load(bad as LoomaDocument)).toThrow(
      new TypeError(invalidMessage(bad)),
    );

    const store = createLoomaStore({
      looma: 1,
      id: 'doc_1',
      cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'video' }] }],
    } as unknown as LoomaDocument);
    expect(store.getDocument().cards[0]?.body[0]).toMatchObject({ id: 'b_1', type: 'unknown' });
  });

  it('returns a deeply frozen document', () => {
    const input = document();
    const store = createLoomaStore(input);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(store.getDocument())).toBe(true);
    expect(Object.isFrozen(store.getDocument().cards)).toBe(true);
    expect(Object.isFrozen(store.getDocument().cards[0])).toBe(true);
  });
});
