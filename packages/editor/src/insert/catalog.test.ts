import { describe, expect, it } from 'vitest';
import { enUS } from '../i18n/en-US';
import { filterCatalog, getCatalog } from './catalog';

describe('filterCatalog', () => {
  const items = getCatalog(enUS);

  it('matches heading1 from h1 and columns from col', () => {
    expect(filterCatalog(items, 'h1', { allowContainers: true }).map((item) => item.id)).toEqual([
      'heading1',
    ]);
    expect(filterCatalog(items, 'col', { allowContainers: true }).map((item) => item.id)).toEqual([
      'columns2',
      'columns3',
    ]);
  });

  it('drops containers when they are not allowed', () => {
    const ids = filterCatalog(items, '', { allowContainers: false }).map((item) => item.id);
    expect(ids).not.toContain('columns2');
    expect(ids).not.toContain('columns3');
    expect(ids).not.toContain('grid2');
    expect(ids).toContain('paragraph');
  });

  it('matches a keyword that contains the query but does not start with it', () => {
    const ids = filterCatalog(items, 'eading', { allowContainers: true }).map((item) => item.id);
    expect(ids).toEqual(['heading1', 'heading2', 'heading3']);
  });

  it('builds every block the menu can insert', () => {
    const byId = Object.fromEntries(items.map((item) => [item.id, item.build()]));
    expect(byId.heading1).toEqual({ type: 'heading', level: 1, text: '' });
    expect(byId.heading2).toEqual({ type: 'heading', level: 2, text: '' });
    expect(byId.heading3).toEqual({ type: 'heading', level: 3, text: '' });
    expect(byId.paragraph).toEqual({ type: 'paragraph', text: '' });
    expect(byId.bulletList).toEqual({ type: 'list', style: 'bullet', items: [''] });
    expect(byId.numberList).toEqual({ type: 'list', style: 'number', items: [''] });
    expect(byId.checkList).toEqual({ type: 'list', style: 'check', items: [''] });
    expect(byId.quote).toEqual({ type: 'quote', text: '' });
    expect(byId.callout).toEqual({ type: 'callout', tone: 'info', text: '' });
    expect(byId.code).toEqual({ type: 'code', language: 'text', code: '' });
    expect(byId.divider).toEqual({ type: 'divider' });
    expect(byId.table).toEqual({
      type: 'table',
      header: true,
      rows: [
        ['', ''],
        ['', ''],
        ['', ''],
      ],
    });
    expect(byId.columns2).toMatchObject({ type: 'columns', widths: [1, 1] });
    expect(byId.columns3).toMatchObject({ type: 'columns', widths: [1, 1, 1] });
    expect(byId.grid2).toMatchObject({ type: 'grid', columns: 2 });

    const image = items.find((item) => item.id === 'image');
    expect(image?.needsAsset).toBe(true);
    expect(image?.build()).toEqual({ type: 'image', assetId: '' });
    expect(image?.build('asset_1')).toEqual({ type: 'image', assetId: 'asset_1' });
  });
});
