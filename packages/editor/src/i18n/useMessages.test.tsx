import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import { EditorContext, createViewState } from '../state/viewState';
import { editorDocument } from '../test/fixture';
import { enUS } from './en-US';
import { formatMessage, useMessages } from './useMessages';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';

function Probe() {
  const messages = useMessages();
  return <span>{messages.undo}</span>;
}

function keys(messages: Record<string, string>): string[] {
  return Object.keys(messages).sort();
}

describe('locale dictionaries', () => {
  it('shares one key set and has no empty strings', () => {
    expect(keys(zhCN)).toEqual(keys(enUS));
    expect(keys(zhTW)).toEqual(keys(enUS));
    for (const messages of [enUS, zhCN, zhTW]) {
      for (const value of Object.values(messages)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('formats numbered labels', () => {
    expect(formatMessage(enUS.cardLabel, { n: 2 })).toBe('Card 2');
    expect(formatMessage(zhCN.cardLabel, { n: 3 })).toBe('第 3 页');
    expect(formatMessage('Keep {missing}', {})).toBe('Keep {missing}');
  });
});

describe('useMessages', () => {
  it('defaults to English', () => {
    render(
      <EditorContext.Provider value={{ viewState: createViewState() }}>
        <Probe />
      </EditorContext.Provider>,
    );
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });

  it('reads zh-CN and zh-TW from the editor context', () => {
    const viewState = createViewState();
    const { rerender } = render(
      <EditorContext.Provider value={{ viewState, locale: 'zh-CN' }}>
        <Probe />
      </EditorContext.Provider>,
    );
    expect(screen.getByText('撤销')).toBeInTheDocument();
    rerender(
      <EditorContext.Provider value={{ viewState, locale: 'zh-TW' }}>
        <Probe />
      </EditorContext.Provider>,
    );
    expect(screen.getByText('復原')).toBeInTheDocument();
  });

  it('switches the editor chrome with the locale prop', () => {
    const { rerender } = render(<LoomaEditor document={editorDocument()} />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Presentation' })).toBeInTheDocument();

    rerender(<LoomaEditor document={editorDocument()} locale="zh-CN" />);
    expect(screen.getByRole('button', { name: '撤销' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '演示' })).toBeInTheDocument();

    rerender(<LoomaEditor document={editorDocument()} locale="zh-TW" />);
    expect(screen.getByRole('button', { name: '復原' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '簡報' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '文件' })).toBeInTheDocument();
  });
});
