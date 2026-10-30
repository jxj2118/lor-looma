import { createLoomaStore, parseDocument } from '@lor-looma/core';
import { Editor } from '@tiptap/core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useMemo, useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { enUS } from '../i18n/en-US';
import { EditorContext, createViewState } from '../state/viewState';
import { createExtensions } from './extensions';
import { FormatToolbar } from './FormatToolbar';
import { docToMarkdown, markdownToDoc } from './markdown';

function documentStore() {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_fmt',
    title: 'Format',
    cards: [{ id: 'c_1', body: [{ id: 'b_p', type: 'paragraph', text: 'Hello' }] }],
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return createLoomaStore(parsed.doc);
}

function ToolbarHost({
  editor,
  layerElement,
}: {
  editor: Editor | null;
  layerElement: HTMLDivElement | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const viewState = useMemo(() => createViewState(), []);
  const store = useMemo(() => documentStore(), []);
  const suppressCommitRef = useMemo(() => ({ current: false }), []);
  const slashActions = useMemo(() => ({ current: { move() {}, confirm() {} } }), []);
  return (
    <EditorContext.Provider
      value={{
        viewState,
        store,
        messages: enUS,
        rootRef,
        layerRef,
        layerElement,
        suppressCommitRef,
        slashActions,
      }}
    >
      <FormatToolbar editor={editor} />
    </EditorContext.Provider>
  );
}

function Host({ onEditor }: { onEditor: (editor: Editor) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [layerElement, setLayerElement] = useState<HTMLDivElement | null>(null);
  const viewState = useMemo(() => createViewState(), []);
  const store = useMemo(() => documentStore(), []);
  const suppressCommitRef = useMemo(() => ({ current: false }), []);
  const slashActions = useMemo(() => ({ current: { move() {}, confirm() {} } }), []);
  const editor = useMemo(() => {
    const host = document.createElement('div');
    document.body.append(host);
    return new Editor({
      element: host,
      extensions: createExtensions({ mode: 'single' }),
      content: markdownToDoc('Hello', 'single'),
    });
  }, []);

  useEffect(() => {
    editor.commands.focus();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    onEditor(editor);
    return () => {
      editor.destroy();
    };
  }, [editor, onEditor]);

  return (
    <EditorContext.Provider
      value={{
        viewState,
        store,
        messages: enUS,
        rootRef,
        layerRef,
        layerElement,
        suppressCommitRef,
        slashActions,
      }}
    >
      <div
        ref={(node) => {
          rootRef.current = node;
          layerRef.current = node;
          setLayerElement(node);
        }}
      />
      <FormatToolbar editor={layerElement ? editor : null} />
    </EditorContext.Provider>
  );
}

describe('FormatToolbar', () => {
  it('renders nothing until an editor and a layer exist', () => {
    const { rerender } = render(<ToolbarHost editor={null} layerElement={null} />);
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    rerender(<ToolbarHost editor={null} layerElement={document.createElement('div')} />);
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });

  it('toggles marks, rejects an unsafe link, and applies color and highlight', async () => {
    const user = userEvent.setup();
    const held: { editor: Editor | null } = { editor: null };
    render(
      <Host
        onEditor={(next) => {
          held.editor = next;
        }}
      />,
    );
    const bold = await screen.findByRole('button', { name: 'Bold' });
    fireEvent.mouseDown(bold);
    await user.click(bold);
    await user.click(screen.getByRole('button', { name: 'Italic' }));
    await user.click(screen.getByRole('button', { name: 'Strike' }));
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    const editor = held.editor;
    if (!editor) throw new Error('missing editor');
    expect(docToMarkdown(editor.getJSON(), 'single')).toContain('`Hello`');
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(docToMarkdown(editor.getJSON(), 'single')).toContain('Hello');

    await user.click(screen.getByRole('button', { name: 'Link' }));
    const link = screen.getByRole('textbox', { name: 'Link' });
    await user.type(link, 'javascript:alert(1)');
    const form = link.closest('form');
    if (!form) throw new Error('missing link form');
    fireEvent.submit(form);
    expect(screen.getByText('Only http, https, and mailto links are allowed.')).toBeInTheDocument();

    fireEvent.keyDown(link, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Link' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Link' }));
    const again = screen.getByRole('textbox', { name: 'Link' });
    const emptyForm = again.closest('form');
    if (!emptyForm) throw new Error('missing link form');
    fireEvent.submit(emptyForm);
    expect(screen.queryByRole('textbox', { name: 'Link' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Link' }));
    const field = screen.getByRole('textbox', { name: 'Link' });
    await user.type(field, 'https://example.com');
    const linkForm = field.closest('form');
    if (!linkForm) throw new Error('missing link form');
    fireEvent.submit(linkForm);
    expect(docToMarkdown(editor.getJSON(), 'single')).toContain('https://example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    const red = await screen.findByRole('button', { name: 'red' });
    fireEvent.mouseDown(red);
    fireEvent.click(red);
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    editor.commands.focus();
    editor.commands.setTextSelection({ from: 1, to: 6 });

    fireEvent.click(await screen.findByRole('button', { name: 'Highlight' }));
    fireEvent.click(await screen.findByRole('button', { name: 'yellow' }));
    expect(docToMarkdown(editor.getJSON(), 'single')).toContain('highlight:yellow');
  });
});
