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
});
