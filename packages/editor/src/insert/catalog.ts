import type { Messages } from '../i18n/en-US';

export interface CatalogItem {
  id:
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'paragraph'
    | 'bulletList'
    | 'numberList'
    | 'checkList'
    | 'quote'
    | 'callout'
    | 'code'
    | 'divider'
    | 'table'
    | 'image'
    | 'columns2'
    | 'columns3'
    | 'grid2';
  group: 'text' | 'media' | 'layout';
  label: string;
  keywords: string[];
  container: boolean;
  needsAsset: boolean;
  build(assetId?: string): unknown;
}

export function getCatalog(messages: Messages): CatalogItem[] {
  return [
    item('heading1', 'text', messages.heading1, ['h1', 'title', 'heading'], false, () => ({
      type: 'heading',
      level: 1,
      text: '',
    })),
    item('heading2', 'text', messages.heading2, ['h2', 'heading'], false, () => ({
      type: 'heading',
      level: 2,
      text: '',
    })),
    item('heading3', 'text', messages.heading3, ['h3', 'heading'], false, () => ({
      type: 'heading',
      level: 3,
      text: '',
    })),
    item('paragraph', 'text', messages.paragraph, ['text', 'p'], false, () => ({
      type: 'paragraph',
      text: '',
    })),
    item('bulletList', 'text', messages.bulletList, ['ul', 'list', 'bullet'], false, () => ({
      type: 'list',
      style: 'bullet',
      items: [''],
    })),
    item('numberList', 'text', messages.numberList, ['ol', 'numbered', 'list'], false, () => ({
      type: 'list',
      style: 'number',
      items: [''],
    })),
    item('checkList', 'text', messages.checkList, ['todo', 'check', 'list'], false, () => ({
      type: 'list',
      style: 'check',
      items: [''],
    })),
    item('quote', 'text', messages.quote, ['blockquote'], false, () => ({
      type: 'quote',
      text: '',
    })),
    item('callout', 'text', messages.callout, ['note', 'info'], false, () => ({
      type: 'callout',
      tone: 'info',
      text: '',
    })),
    item('code', 'text', messages.code, ['pre', 'snippet'], false, () => ({
      type: 'code',
      language: 'text',
      code: '',
    })),
    item('divider', 'text', messages.divider, ['hr', 'rule', 'line'], false, () => ({
      type: 'divider',
    })),
    item('table', 'text', messages.table, ['grid'], false, () => ({
      type: 'table',
      header: true,
      rows: [
        ['', ''],
        ['', ''],
        ['', ''],
      ],
    })),
    item(
      'image',
      'media',
      messages.image,
      ['picture', 'photo', 'img'],
      false,
      (assetId) => ({
        type: 'image',
        assetId: assetId ?? '',
      }),
      true,
    ),
    item('columns2', 'layout', messages.columns2, ['columns', 'col', 'layout'], true, () => ({
      type: 'columns',
      widths: [1, 1],
      children: [[{ type: 'paragraph', text: '' }], [{ type: 'paragraph', text: '' }]],
    })),
    item('columns3', 'layout', messages.columns3, ['columns', 'col', 'layout'], true, () => ({
      type: 'columns',
      widths: [1, 1, 1],
      children: [
        [{ type: 'paragraph', text: '' }],
        [{ type: 'paragraph', text: '' }],
        [{ type: 'paragraph', text: '' }],
      ],
    })),
    item('grid2', 'layout', messages.grid2, ['grid', 'layout'], true, () => ({
      type: 'grid',
      columns: 2,
      children: [
        { type: 'paragraph', text: '' },
        { type: 'paragraph', text: '' },
      ],
    })),
  ];
}

function item(
  id: CatalogItem['id'],
  group: CatalogItem['group'],
  label: string,
  keywords: string[],
  container: boolean,
  build: (assetId?: string) => unknown,
  needsAsset = false,
): CatalogItem {
  return { id, group, label, keywords, container, needsAsset, build };
}

export function filterCatalog(
  items: CatalogItem[],
  query: string,
  opts: { allowContainers: boolean },
): CatalogItem[] {
  const needle = query.trim().toLowerCase();
  return items.filter((entry) => {
    if (!opts.allowContainers && entry.container) return false;
    if (!needle) return true;
    const fields = [entry.label, ...entry.keywords].map((field) => field.toLowerCase());
    return fields.some((field) => field.startsWith(needle) || field.includes(needle));
  });
}
