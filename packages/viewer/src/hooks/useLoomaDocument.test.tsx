import { createLoomaStore, parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useLoomaDocument } from './useLoomaDocument';

function document(title = 'Demo'): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_demo',
    title,
    cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'paragraph', text: 'Hello' }] }],
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

function Title({
  document: doc,
  store,
}: {
  document?: LoomaDocument;
  store?: ReturnType<typeof createLoomaStore>;
}) {
  const current = useLoomaDocument({ document: doc, store });
  return <p>{current.title}</p>;
}

describe('useLoomaDocument', () => {
  it('re-renders when the store applies and undoes', () => {
    const store = createLoomaStore(document());
    render(<Title store={store} />);
    expect(screen.getByText('Demo')).toBeInTheDocument();

    act(() => {
      store.apply([{ op: 'setTitle', title: 'Changed' }]);
    });
    expect(screen.getByText('Changed')).toBeInTheDocument();

    act(() => {
      store.undo();
    });
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  it('updates when the document prop changes', () => {
    const { rerender } = render(<Title document={document('First')} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    rerender(<Title document={document('Second')} />);
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('prefers the store over a document prop', () => {
    const store = createLoomaStore(document('From store'));
    render(<Title store={store} document={document('From prop')} />);
    expect(screen.getByText('From store')).toBeInTheDocument();
  });

  it('throws when neither a document nor a store is given', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Title />)).toThrow('LoomaViewer needs either a document or a store');
    error.mockRestore();
  });
});
