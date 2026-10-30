import { act, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { EditorContext, createViewState, useEditorContext, useViewState } from './viewState';
import type { ViewState } from './viewState';

describe('createViewState', () => {
  it('merges updates and skips notification when every field is unchanged', () => {
    const store = createViewState();
    let calls = 0;
    const stop = store.subscribe(() => {
      calls += 1;
    });

    store.set({ hoverId: null });
    expect(calls).toBe(0);

    store.set({ hoverId: 'b_1' });
    expect(calls).toBe(1);
    expect(store.get().hoverId).toBe('b_1');
    expect(store.get().selection).toEqual({ cardId: null, nodeIds: [] });

    const selection = store.get().selection;
    store.set((state) => ({ hoverId: state.hoverId, selection }));
    expect(calls).toBe(1);

    stop();
    store.set({ hoverId: 'b_2' });
    expect(calls).toBe(1);
    expect(store.get().hoverId).toBe('b_2');
  });
});

describe('useViewState', () => {
  it('does not rerender when the selected value stays the same', () => {
    const store = createViewState();
    let renders = 0;

    function Hover() {
      const hoverId = useViewState((state) => state.hoverId);
      renders += 1;
      return <span>{hoverId ?? 'none'}</span>;
    }

    const { getByText } = render(
      <EditorContext.Provider value={{ viewState: store }}>
        <Hover />
      </EditorContext.Provider>,
    );
    expect(renders).toBe(1);
    expect(getByText('none')).toBeInTheDocument();

    act(() => {
      store.set({ notice: { id: 1, message: 'Saved' } });
    });
    expect(renders).toBe(1);

    act(() => {
      store.set({ hoverId: 'b_1' });
    });
    expect(renders).toBe(2);
    expect(getByText('b_1')).toBeInTheDocument();
  });

  it('rerenders after the selector itself changes to a different result', () => {
    const store = createViewState({ hoverId: 'b_1', selection: { cardId: 'c_a', nodeIds: [] } });
    let renders = 0;

    function Probe({ pick }: { pick: (state: ViewState) => string | null }) {
      const value = useViewState(pick);
      renders += 1;
      return <span>{value}</span>;
    }

    function Host() {
      const [field, setField] = useState<'hover' | 'card'>('hover');
      const pick = (state: ViewState) =>
        field === 'hover' ? state.hoverId : state.selection.cardId;
      return (
        <div>
          <button type="button" onClick={() => setField('card')}>
            switch
          </button>
          <Probe pick={pick} />
        </div>
      );
    }

    const { getByRole, getByText } = render(
      <EditorContext.Provider value={{ viewState: store }}>
        <Host />
      </EditorContext.Provider>,
    );
    const before = renders;
    act(() => {
      getByRole('button', { name: 'switch' }).click();
    });
    expect(getByText('c_a')).toBeInTheDocument();
    expect(renders).toBeGreaterThan(before);
  });

  it('reads the same selection on the server', () => {
    const store = createViewState({ hoverId: 'b_1' });
    function Hover() {
      return <span>{useViewState((state) => state.hoverId)}</span>;
    }
    expect(
      renderToStaticMarkup(
        <EditorContext.Provider value={{ viewState: store }}>
          <Hover />
        </EditorContext.Provider>,
      ),
    ).toContain('b_1');
  });
});

describe('useEditorContext', () => {
  it('refuses to run outside the editor', () => {
    function Probe() {
      useEditorContext();
      return null;
    }
    const store = createViewState();
    expect(() =>
      render(
        <EditorContext.Provider value={{ viewState: store }}>
          <Probe />
        </EditorContext.Provider>,
      ),
    ).toThrow(/inside LoomaEditor/);
  });
});
