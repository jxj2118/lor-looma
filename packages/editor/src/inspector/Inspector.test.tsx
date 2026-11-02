import { parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';
import { fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';

function documentWith(
  cards: LoomaDocument['cards'],
  assets?: LoomaDocument['assets'],
): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_edit',
    title: 'Notes',
    format: 'presentation',
    ...(assets ? { assets } : {}),
    cards,
  });
  if (!parsed.ok) throw new Error(parsed.errors.map((issue) => issue.message).join('; '));
  return parsed.doc;
}

function panel(): HTMLElement {
  const element = document.querySelector('[data-lm-inspector]');
  if (!(element instanceof HTMLElement)) throw new Error('missing inspector');
  return element;
}

function body(ref: { current: LoomaEditorHandle | null }) {
  return ref.current?.store.getDocument().cards[0]?.body ?? [];
}

describe('Inspector blocks', () => {
  it('edits heading, paragraph, list, callout, quote, and code fields', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <LoomaEditor
        ref={ref}
        document={documentWith([
          {
            id: 'c_1',
            body: [
              { id: 'b_h', type: 'heading', level: 2, text: 'Title' },
              { id: 'b_p', type: 'paragraph', text: 'Body' },
              { id: 'b_list', type: 'list', style: 'bullet', items: ['One'] },
              { id: 'b_call', type: 'callout', tone: 'info', text: 'Note' },
              { id: 'b_q', type: 'quote', text: 'Words', cite: 'Ada' },
              { id: 'b_code', type: 'code', language: 'ts', code: 'const a = 1' },
            ],
          },
        ])}
      />,
    );
    fireSelect(ref, 'b_h');

    await user.selectOptions(within(panel()).getByRole('combobox', { name: 'Heading level' }), '1');
    expect(body(ref)[0]).toMatchObject({ level: 1 });

    fireSelect(ref, 'b_p');
    await user.selectOptions(
      within(panel()).getByRole('combobox', { name: 'Alignment' }),
      'center',
    );
    expect(body(ref)[1]).toMatchObject({ align: 'center' });

    fireSelect(ref, 'b_list');
    await user.selectOptions(
      within(panel()).getByRole('combobox', { name: 'List style' }),
      'check',
    );
    expect(body(ref)[2]).toMatchObject({ style: 'check' });

    fireSelect(ref, 'b_call');
    await user.selectOptions(within(panel()).getByRole('combobox', { name: 'Tone' }), 'danger');
    expect(body(ref)[3]).toMatchObject({ tone: 'danger' });

    fireSelect(ref, 'b_q');
    fireEvent.change(within(panel()).getByRole('textbox', { name: 'Citation' }), {
      target: { value: '' },
    });
    expect(body(ref)[4]).toMatchObject({ type: 'quote' });
    expect(body(ref)[4]).not.toHaveProperty('cite');

    fireSelect(ref, 'b_code');
    fireEvent.change(within(panel()).getByRole('textbox', { name: 'Language' }), {
      target: { value: '' },
    });
    expect(body(ref)[5]).not.toHaveProperty('language');
    fireEvent.change(within(panel()).getByRole('textbox', { name: 'Language' }), {
      target: { value: 'py' },
    });
    expect(body(ref)[5]).toMatchObject({ language: 'py' });
  });

  it('edits an image and a table, including the minimum row and column', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    const uploadAsset = vi.fn(async () => ({ src: 'https://cdn.example/up.png', alt: 'Up' }));
    render(
      <LoomaEditor
        ref={ref}
        uploadAsset={uploadAsset}
        document={documentWith(
          [
            {
              id: 'c_1',
              body: [
                { id: 'b_img', type: 'image', assetId: 'img_1', fit: 'cover' },
                { id: 'b_table', type: 'table', header: false, rows: [['A', 'B']] },
                { id: 'b_div', type: 'divider' },
              ],
            },
          ],
          { img_1: { kind: 'image', src: 'https://example.com/a.png', alt: 'A' } },
        )}
      />,
    );
    act(() => ref.current?.select(['b_img']));
    await user.selectOptions(within(panel()).getByRole('combobox', { name: 'Fit' }), 'contain');
    await user.selectOptions(within(panel()).getByRole('combobox', { name: 'Width' }), 'full');
    fireEvent.change(within(panel()).getByRole('textbox', { name: 'Caption' }), {
      target: { value: 'Shore' },
    });
    expect(body(ref)[0]).toMatchObject({ fit: 'contain', width: 'full', caption: 'Shore' });

    await user.type(within(panel()).getByRole('textbox', { name: 'Image URL' }), 'notaurl');
    await user.click(within(panel()).getByRole('button', { name: 'Replace image' }));
    expect(within(panel()).getByText(/must start with/i)).toBeInTheDocument();

    await user.clear(within(panel()).getByRole('textbox', { name: 'Image URL' }));
    await user.type(
      within(panel()).getByRole('textbox', { name: 'Image URL' }),
      'https://example.com/b.png',
    );
    await user.click(within(panel()).getByRole('button', { name: 'Replace image' }));
    const image = body(ref)[0];
    expect(image).toMatchObject({ type: 'image' });
    if (image?.type !== 'image') return;
    expect(image.assetId).not.toBe('img_1');
    expect(ref.current?.store.getDocument().assets[image.assetId]?.src).toBe(
      'https://example.com/b.png',
    );

    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const input = panel().querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('missing file input');
    await user.upload(input, file);
    expect(uploadAsset).toHaveBeenCalledWith(file);
    const uploaded = body(ref)[0];
    if (uploaded?.type !== 'image') throw new Error('image missing');
    expect(ref.current?.store.getDocument().assets[uploaded.assetId]?.src).toBe(
      'https://cdn.example/up.png',
    );

    act(() => ref.current?.select(['b_table']));
    await user.click(within(panel()).getByRole('checkbox', { name: 'Header row' }));
    await user.click(within(panel()).getByRole('button', { name: 'Add row' }));
    await user.click(within(panel()).getByRole('button', { name: 'Add column' }));
    expect(body(ref)[1]).toMatchObject({
      header: true,
      rows: [
        ['A', 'B', ''],
        ['', '', ''],
      ],
    });
    await user.click(within(panel()).getByRole('button', { name: 'Remove row' }));
    await user.click(within(panel()).getByRole('button', { name: 'Remove column' }));
    await user.click(within(panel()).getByRole('button', { name: 'Remove column' }));
    expect(within(panel()).getByRole('button', { name: 'Remove row' })).toBeDisabled();
    expect(within(panel()).getByRole('button', { name: 'Remove column' })).toBeDisabled();
    expect(body(ref)[1]).toMatchObject({ rows: [['A']] });

    act(() => ref.current?.select(['b_div']));
    expect(within(panel()).getByText('Divider')).toBeInTheDocument();
    expect(within(panel()).queryByRole('combobox')).toBeNull();
  });

  it('moves, duplicates, deletes, and jumps to the parent container', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <LoomaEditor
        ref={ref}
        document={documentWith([
          {
            id: 'c_1',
            body: [
              { id: 'b_1', type: 'paragraph', text: 'One' },
              { id: 'b_2', type: 'paragraph', text: 'Two' },
              {
                id: 'n_cols',
                type: 'columns',
                widths: [1, 1],
                children: [[{ id: 'b_left', type: 'paragraph', text: 'Left' }], []],
              },
            ],
          },
        ])}
      />,
    );
    act(() => ref.current?.select(['n_cols']));
    expect(within(panel()).getByRole('button', { name: 'Move down' })).toBeDisabled();
    act(() => ref.current?.select(['b_2']));
    await user.click(within(panel()).getByRole('button', { name: 'Move up' }));
    expect(body(ref).map((node) => node.id)).toEqual(['b_2', 'b_1', 'n_cols']);

    await user.click(within(panel()).getByRole('button', { name: 'Duplicate' }));
    expect(body(ref)).toHaveLength(4);
    expect(body(ref)[1]).toMatchObject({ type: 'paragraph', text: 'Two' });
    expect(ref.current?.getSelection().nodeIds).toEqual([body(ref)[1]?.id]);

    act(() => ref.current?.select(['b_left']));
    await user.click(within(panel()).getByRole('button', { name: 'Select parent container' }));
    expect(ref.current?.getSelection().nodeIds).toEqual(['n_cols']);
    expect(within(panel()).getByRole('combobox', { name: 'Gap' })).toBeInTheDocument();

    act(() => ref.current?.select(['b_1']));
    await user.click(within(panel()).getByRole('button', { name: 'Delete' }));
    expect(body(ref).map((node) => node.id)).not.toContain('b_1');
  });
});

describe('Inspector containers', () => {
  it('edits stack, columns, and grid, and unwraps a container', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <LoomaEditor
        ref={ref}
        document={documentWith([
          {
            id: 'c_1',
            body: [
              {
                id: 'n_stack',
                type: 'stack',
                gap: 'sm',
                children: [
                  { id: 'b_a', type: 'paragraph', text: 'A' },
                  { id: 'b_b', type: 'paragraph', text: 'B' },
                ],
              },
              {
                id: 'n_cols',
                type: 'columns',
                widths: [1, 1, 1],
                align: 'start',
                children: [
                  [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
                  [{ id: 'b_mid', type: 'paragraph', text: 'Mid' }],
                  [],
                ],
              },
              { id: 'n_grid', type: 'grid', columns: 2, children: [] },
            ],
          },
        ])}
      />,
    );
    act(() => ref.current?.select(['n_stack']));
    await user.selectOptions(within(panel()).getByRole('combobox', { name: 'Gap' }), 'lg');
    expect(body(ref)[0]).toMatchObject({ gap: 'lg' });
    await user.click(within(panel()).getByRole('button', { name: 'Unwrap container' }));
    expect(
      body(ref)
        .slice(0, 2)
        .map((node) => node.id),
    ).toEqual(['b_a', 'b_b']);
    expect(ref.current?.getSelection()).toMatchObject({ cardId: 'c_1', nodeIds: [] });

    act(() => ref.current?.select(['n_cols']));
    await user.selectOptions(
      within(panel()).getByRole('combobox', { name: 'Column alignment' }),
      'end',
    );
    const width = within(panel()).getByRole('spinbutton', { name: 'Column 1' });
    fireEvent.change(width, { target: { value: '3' } });
    expect(body(ref).find((node) => node.id === 'n_cols')).toMatchObject({
      align: 'end',
      widths: [3, 1, 1],
    });
    await user.click(within(panel()).getByRole('button', { name: 'Add column' }));
    let columns = body(ref).find((node) => node.id === 'n_cols');
    expect(columns).toMatchObject({ type: 'columns' });
    if (columns?.type !== 'columns') return;
    expect(columns.children).toHaveLength(4);
    expect(within(panel()).getByRole('button', { name: 'Add column' })).toBeDisabled();

    await user.click(within(panel()).getByRole('button', { name: 'Delete column 2' }));
    columns = body(ref).find((node) => node.id === 'n_cols');
    if (columns?.type !== 'columns') throw new Error('columns missing');
    expect(columns.children).toHaveLength(3);
    expect(columns.children[0]?.map((node) => node.id)).toEqual(['b_left', 'b_mid']);

    act(() => ref.current?.select(['n_grid']));
    await user.selectOptions(within(panel()).getByRole('combobox', { name: 'Columns' }), '4');
    expect(body(ref).find((node) => node.id === 'n_grid')).toMatchObject({ columns: 4 });
  });

  it('wraps a sibling run in columns, grid, or stack', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <LoomaEditor
        ref={ref}
        document={documentWith([
          {
            id: 'c_1',
            body: [
              { id: 'b_1', type: 'paragraph', text: 'One' },
              { id: 'b_2', type: 'paragraph', text: 'Two' },
              { id: 'b_3', type: 'paragraph', text: 'Three' },
              { id: 'b_4', type: 'paragraph', text: 'Four' },
              { id: 'b_5', type: 'paragraph', text: 'Five' },
            ],
          },
        ])}
      />,
    );
    act(() => ref.current?.select(['b_1', 'b_2']));
    await user.click(within(panel()).getByRole('button', { name: 'Wrap in columns' }));
    const wrapped = body(ref)[0];
    expect(wrapped?.type).toBe('columns');
    if (wrapped?.type !== 'columns') return;
    expect(
      wrapped.children.map((column) => column.map((node) => ('text' in node ? node.text : ''))),
    ).toEqual([['One'], ['Two']]);
    expect(ref.current?.getSelection().nodeIds).toEqual([wrapped.id]);

    act(() => ref.current?.select(['b_3', 'b_4']));
    await user.click(within(panel()).getByRole('button', { name: 'Wrap in grid' }));
    expect(body(ref).some((node) => node.type === 'grid')).toBe(true);

    act(() => ref.current?.select(['b_1', 'b_2', 'b_3', 'b_4', 'b_5']));
    expect(within(panel()).getByRole('button', { name: 'Wrap in columns' })).toBeDisabled();
  });

  it('refuses a wrap that would nest containers too deeply and deletes the selection', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <LoomaEditor
        ref={ref}
        document={documentWith([
          {
            id: 'c_1',
            body: [
              { id: 'b_1', type: 'paragraph', text: 'One' },
              { id: 'b_2', type: 'paragraph', text: 'Two' },
              { id: 'b_3', type: 'paragraph', text: 'Three' },
              { id: 'b_4', type: 'paragraph', text: 'Four' },
              { id: 'b_5', type: 'paragraph', text: 'Five' },
              {
                id: 'n_stack',
                type: 'stack',
                children: [
                  {
                    id: 'n_cols',
                    type: 'columns',
                    widths: [1, 1],
                    children: [
                      [
                        { id: 'b_a', type: 'paragraph', text: 'A' },
                        { id: 'b_b', type: 'paragraph', text: 'B' },
                      ],
                      [],
                    ],
                  },
                ],
              },
            ],
          },
        ])}
      />,
    );
    act(() => ref.current?.select(['b_1', 'b_2', 'b_3', 'b_4', 'b_5']));
    expect(within(panel()).getByRole('button', { name: 'Wrap in columns' })).toBeDisabled();
    await user.click(within(panel()).getByRole('button', { name: 'Wrap in stack' }));
    expect(body(ref)[0]?.type).toBe('stack');

    act(() => ref.current?.select(['b_a', 'b_b']));
    expect(within(panel()).getByRole('button', { name: 'Wrap in columns' })).toBeDisabled();
    expect(within(panel()).getByRole('button', { name: 'Wrap in grid' })).toBeDisabled();
    expect(within(panel()).getByRole('button', { name: 'Wrap in stack' })).toBeDisabled();
    await user.click(within(panel()).getByRole('button', { name: 'Delete selected' }));
    const columns = findColumns(ref.current?.store.getDocument());
    expect(columns?.children[0]).toEqual([]);
  });

  it('hides the inspector while read only', () => {
    render(
      <LoomaEditor
        readOnly
        document={documentWith([
          { id: 'c_1', body: [{ id: 'b_1', type: 'paragraph', text: 'One' }] },
        ])}
      />,
    );
    expect(document.querySelector('[data-lm-inspector]')).toBeNull();
  });
});

function fireSelect(ref: { current: LoomaEditorHandle | null }, id: string) {
  act(() => ref.current?.select([id]));
}

function findColumns(doc: LoomaDocument | undefined) {
  const stack = doc?.cards[0]?.body.find((node) => node.id === 'n_stack');
  if (stack?.type !== 'stack') return null;
  const columns = stack.children.find((node) => node.id === 'n_cols');
  return columns?.type === 'columns' ? columns : null;
}
