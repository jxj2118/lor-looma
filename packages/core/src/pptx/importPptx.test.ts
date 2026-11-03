import { describe, expect, it } from 'vitest';
import type { LoomaCard, LoomaNode } from '../schema';
import { createZip, importPptx } from './index';
import type { ImportPptxOptions } from './index';

const PNG = bytesFromBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);
const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x11, 0x00, 0x02,
  0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
);

const SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const LINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';
const NOTES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';

async function load(
  entries: Record<string, string | Uint8Array>,
  options?: ImportPptxOptions & { compress?: boolean },
) {
  const { compress, ...importOptions } = options ?? {};
  const zip = await createZip(entries, { compress });
  const result = await importPptx(new Uint8Array(zip).buffer, importOptions);
  return result;
}

async function loaded(
  entries: Record<string, string | Uint8Array>,
  options?: ImportPptxOptions & { compress?: boolean },
) {
  const result = await load(entries, options);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function rels(items: { id: string; type: string; target: string; external?: boolean }[]): string {
  const body = items
    .map((item) => {
      const mode = item.external ? ' TargetMode="External"' : '';
      return `<Relationship Id="${item.id}" Type="${item.type}" Target="${item.target}"${mode}/>`;
    })
    .join('');
  return `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

function presentation(ids: string[], size?: { cx: number; cy: number }): string {
  const slides = ids.map((id, index) => `<p:sldId id="${256 + index}" r:id="${id}"/>`).join('');
  const sldSz = size ? `<p:sldSz cx="${size.cx}" cy="${size.cy}"/>` : '';
  return `<?xml version="1.0"?>
<p:presentation xmlns:p="urn:p" xmlns:r="urn:r">
  <p:sldIdLst>${slides}</p:sldIdLst>
  ${sldSz}
</p:presentation>`;
}

function slideXml(shapes: string, cx: number, cy: number, background = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="urn:a" xmlns:p="urn:p" xmlns:r="urn:r">
  <p:cSld>
    ${background}
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/>
          <a:chOff x="0" y="0"/><a:chExt cx="${cx}" cy="${cy}"/>
        </a:xfrm>
      </p:grpSpPr>
      ${shapes}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function textBox(options: {
  x: number;
  y: number;
  cx: number;
  cy: number;
  ph?: string;
  paragraphs: string;
}): string {
  const placeholder = options.ph
    ? `<p:nvSpPr><p:nvPr><p:ph type="${options.ph}"/></p:nvPr></p:nvSpPr>`
    : '<p:nvSpPr><p:nvPr/></p:nvSpPr>';
  return `<p:sp>${placeholder}
    <p:spPr><a:xfrm><a:off x="${options.x}" y="${options.y}"/><a:ext cx="${options.cx}" cy="${options.cy}"/></a:xfrm></p:spPr>
    <p:txBody><a:bodyPr/>${options.paragraphs}</p:txBody>
  </p:sp>`;
}

function picture(options: {
  x: number;
  y: number;
  cx: number;
  cy: number;
  embed: string;
  video?: boolean;
}): string {
  const nv = options.video
    ? '<p:nvPicPr><p:nvPr><a:videoFile r:link="rIdVid"/></p:nvPr></p:nvPicPr>'
    : '<p:nvPicPr/>';
  return `<p:pic>${nv}
    <p:blipFill><a:blip r:embed="${options.embed}"/></p:blipFill>
    <p:spPr><a:xfrm><a:off x="${options.x}" y="${options.y}"/><a:ext cx="${options.cx}" cy="${options.cy}"/></a:xfrm></p:spPr>
  </p:pic>`;
}

function table(options: {
  x: number;
  y: number;
  cx: number;
  cy: number;
  firstRow?: boolean;
  rows: string[][];
}): string {
  const props =
    options.firstRow === undefined ? '' : `<a:tblPr firstRow="${options.firstRow ? '1' : '0'}"/>`;
  const rows = options.rows
    .map(
      (row) =>
        `<a:tr>${row.map((cell) => `<a:tc><a:txBody><a:p>${cell}</a:p></a:txBody></a:tc>`).join('')}</a:tr>`,
    )
    .join('');
  return `<p:graphicFrame>
    <p:xfrm><a:off x="${options.x}" y="${options.y}"/><a:ext cx="${options.cx}" cy="${options.cy}"/></p:xfrm>
    <a:graphic><a:graphicData><a:tbl>${props}${rows}</a:tbl></a:graphicData></a:graphic>
  </p:graphicFrame>`;
}

function run(text: string, props = ''): string {
  const formatted = props ? `<a:rPr ${props}/>` : '';
  return `<a:r>${formatted}<a:t>${text}</a:t></a:r>`;
}

function typesOf(card: LoomaCard): string[] {
  return walk(card.body).map((node) => node.type);
}

function walk(nodes: readonly LoomaNode[], out: LoomaNode[] = []): LoomaNode[] {
  for (const node of nodes) {
    out.push(node);
    if (node.type === 'columns') for (const column of node.children) walk(column, out);
  }
  return out;
}

function mainDeck(): Record<string, string | Uint8Array> {
  const cx = 12_192_000;
  const cy = 9_000_000;
  const full = 11_000_000;
  const content = slideXml(
    [
      textBox({
        x: 0,
        y: 0,
        cx: full,
        cy: 500_000,
        ph: 'ctrTitle',
        paragraphs: `<a:p>${run('Quarterly Review', 'sz="4400"')}</a:p>`,
      }),
      textBox({
        x: 0,
        y: 600_000,
        cx: full,
        cy: 400_000,
        ph: 'subTitle',
        paragraphs: `<a:p>${run('Prepared for the board')}</a:p>`,
      }),
      textBox({
        x: 0,
        y: 1_100_000,
        cx: full,
        cy: 900_000,
        paragraphs: [
          '<a:p>',
          run('See '),
          `<a:r><a:rPr b="1"><a:hlinkClick r:id="rIdLink"/></a:rPr><a:t>docs</a:t></a:r>`,
          run(' '),
          run('note', 'i="1"'),
          run(' '),
          run('old', 'strike="sngStrike"'),
          '<a:br/>',
          run('a*b'),
          '</a:p>',
          `<a:p><a:pPr algn="r"/>${run('Right side')}</a:p>`,
          `<a:p><a:pPr algn="ctr"/>${run('Centered')}</a:p>`,
          `<a:p><a:r><a:rPr><a:hlinkClick r:id="rIdMail"/></a:rPr><a:t>Ada</a:t></a:r></a:p>`,
          `<a:p><a:r><a:rPr><a:hlinkClick r:id="rIdBad"/></a:rPr><a:t>click</a:t></a:r></a:p>`,
          `<a:p>${run('A &amp; B')}</a:p>`,
        ].join(''),
      }),
      textBox({
        x: 0,
        y: 2_100_000,
        cx: full,
        cy: 1_000_000,
        paragraphs: [
          `<a:p><a:pPr lvl="0"><a:buChar char="•"/></a:pPr>${run('Parent', 'b="1"')}</a:p>`,
          `<a:p><a:pPr lvl="1"><a:buChar char="•"/></a:pPr>${run('Child')}</a:p>`,
          `<a:p><a:pPr lvl="2"/>${run('Grand')}</a:p>`,
          `<a:p><a:pPr lvl="0"><a:buAutoNum type="arabicPeriod"/></a:pPr>${run('Numbered')}</a:p>`,
        ].join(''),
      }),
      table({
        x: 0,
        y: 3_200_000,
        cx: full,
        cy: 700_000,
        firstRow: true,
        rows: [
          [run('Name', 'b="1"'), run('Score')],
          [run('Ada'), run('10')],
        ],
      }),
      table({
        x: 0,
        y: 4_000_000,
        cx: full,
        cy: 700_000,
        rows: [
          [run('A'), run('B')],
          [run('C'), run('D')],
        ],
      }),
      table({
        x: 0,
        y: 4_800_000,
        cx: full,
        cy: 400_000,
        rows: [[run('Only')]],
      }),
      textBox({
        x: 0,
        y: 5_300_000,
        cx: full,
        cy: 700_000,
        paragraphs: `<a:p>${run('Big idea', 'sz="3200"')}</a:p><a:p>${run('supporting line')}</a:p>`,
      }),
      textBox({
        x: 0,
        y: 6_100_000,
        cx: full,
        cy: 500_000,
        ph: 'body',
        paragraphs: `<a:p>${run('Not a title', 'sz="4400"')}</a:p>`,
      }),
      picture({ x: 0, y: 6_700_000, cx: 900_000, cy: 400_000, embed: 'rIdJpg' }),
      picture({ x: 0, y: 7_200_000, cx: 900_000, cy: 400_000, embed: 'rIdSvg' }),
      picture({ x: 0, y: 7_700_000, cx: 900_000, cy: 400_000, embed: 'rIdPreview', video: true }),
      `<p:graphicFrame><p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm><a:graphic><a:graphicData/></a:graphic></p:graphicFrame>`,
      picture({ x: 2_000_000, y: 7_700_000, cx: 900_000, cy: 400_000, embed: 'rIdEmf' }),
    ].join(''),
    cx,
    cy,
    '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill></p:bgPr></p:bg>',
  );
  const beside = slideXml(
    [
      picture({ x: 7_500_000, y: 1_000_000, cx: 4_500_000, cy: 5_000_000, embed: 'rIdHero' }),
      textBox({
        x: 400_000,
        y: 1_500_000,
        cx: 5_000_000,
        cy: 3_000_000,
        ph: 'title',
        paragraphs: `<a:p>${run('Beside')}</a:p>`,
      }),
    ].join(''),
    cx,
    cy,
  );
  const banner = slideXml(
    [
      picture({ x: 400_000, y: 0, cx: 10_000_000, cy: 2_000_000, embed: 'rIdHero' }),
      textBox({
        x: 1_000_000,
        y: 4_000_000,
        cx: 8_000_000,
        cy: 1_500_000,
        paragraphs: `<a:p>${run('Under the banner')}</a:p>`,
      }),
    ].join(''),
    cx,
    cy,
  );
  const columns = slideXml(
    [
      textBox({
        x: 0,
        y: 100_000,
        cx: full,
        cy: 700_000,
        ph: 'title',
        paragraphs: `<a:p>${run('Compare')}</a:p>`,
      }),
      textBox({
        x: 200_000,
        y: 2_000_000,
        cx: 4_000_000,
        cy: 4_000_000,
        paragraphs: `<a:p>${run('Left column')}</a:p>`,
      }),
      textBox({
        x: 6_000_000,
        y: 2_200_000,
        cx: 6_000_000,
        cy: 3_600_000,
        paragraphs: `<a:p>${run('Right column')}</a:p>`,
      }),
      picture({ x: 200_000, y: 6_500_000, cx: 800_000, cy: 500_000, embed: 'rIdHero' }),
    ].join(''),
    cx,
    cy,
  );
  const ignored = slideXml(
    textBox({
      x: 0,
      y: 0,
      cx: full,
      cy: 500_000,
      paragraphs: `<a:p>${run('Ignore me', 'sz="3200"')}</a:p>`,
    }),
    cx,
    cy,
  );
  return {
    'docProps/core.xml':
      '<?xml version="1.0"?><cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Quarterly Review</dc:title></cp:coreProperties>',
    'ppt/presentation.xml': presentation(['rId1', 'rId2', 'rId3', 'rId4'], { cx, cy }),
    'ppt/_rels/presentation.xml.rels': rels([
      { id: 'rId1', type: SLIDE, target: 'slides/slide2.xml' },
      { id: 'rId2', type: SLIDE, target: 'slides/slide1.xml' },
      { id: 'rId3', type: SLIDE, target: 'slides/slide4.xml' },
      { id: 'rId4', type: SLIDE, target: 'slides/slide3.xml' },
    ]),
    'ppt/slides/slide2.xml': content,
    'ppt/slides/_rels/slide2.xml.rels': rels([
      { id: 'rIdLink', type: LINK, target: 'https://example.com/docs', external: true },
      { id: 'rIdMail', type: LINK, target: 'mailto:ada@example.com', external: true },
      { id: 'rIdBad', type: LINK, target: 'javascript:alert(1)', external: true },
      { id: 'rIdJpg', type: IMAGE, target: '../media/photo.jpg' },
      { id: 'rIdSvg', type: IMAGE, target: '../media/mark.svg' },
      { id: 'rIdEmf', type: IMAGE, target: '../media/clip.emf' },
      { id: 'rIdPreview', type: IMAGE, target: '../media/preview.png' },
      { id: 'rIdNotes', type: NOTES, target: '../notesSlides/notesSlide1.xml' },
    ]),
    'ppt/slides/slide1.xml': beside,
    'ppt/slides/_rels/slide1.xml.rels': rels([
      { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
    ]),
    'ppt/slides/slide4.xml': banner,
    'ppt/slides/_rels/slide4.xml.rels': rels([
      { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
    ]),
    'ppt/slides/slide3.xml': columns,
    'ppt/slides/_rels/slide3.xml.rels': rels([
      { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
    ]),
    'ppt/slides/slide9.xml': ignored,
    'ppt/notesSlides/notesSlide1.xml': `<?xml version="1.0"?>
<p:notes xmlns:a="urn:a" xmlns:p="urn:p"><p:cSld><p:spTree>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
    <p:txBody><a:p>${run('Say this slowly')}</a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr>
    <p:txBody><a:p>${run('4')}</a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:notes>`,
    'ppt/media/photo.jpg': JPEG,
    'ppt/media/mark.svg': SVG,
    'ppt/media/hero.png': PNG,
    'ppt/media/clip.emf': Uint8Array.of(1, 2, 3),
    'ppt/media/preview.png': PNG,
  };
}

describe('importPptx', () => {
  it('converts a multi-slide deck into cards, assets, and notes', async () => {
    const result = await loaded(mainDeck(), { title: 'From file name', themePreset: 'warm' });
    const { doc, warnings } = result;
    expect(doc.looma).toBe(1);
    expect(doc.format).toBe('presentation');
    expect(doc.theme.preset).toBe('warm');
    expect(doc.title).toBe('Quarterly Review');
    expect(doc.cards).toHaveLength(4);
    expect(warnings).toEqual([
      'Skipped video or audio on slide 1.',
      'Skipped unsupported graphic on slide 1.',
      'Skipped unsupported media "ppt/media/clip.emf".',
    ]);
    expect(JSON.stringify(doc)).not.toContain('Ignore me');
    expect(JSON.stringify(doc)).not.toContain('preview.png');

    const [content, beside, banner, columns] = doc.cards as [
      LoomaCard,
      LoomaCard,
      LoomaCard,
      LoomaCard,
    ];
    expect(content?.background).toEqual({ kind: 'color', value: '#112233' });
    expect(content?.notes).toBe('Say this slowly');
    expect(content?.accent).toBeUndefined();
    const contentNodes = content ? walk(content.body) : [];
    expect(contentNodes.map((node) => node.type)).toEqual([
      'heading',
      'heading',
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
      'list',
      'list',
      'table',
      'table',
      'table',
      'heading',
      'paragraph',
      'paragraph',
      'image',
      'image',
    ]);
    expect(contentNodes[0]).toMatchObject({ type: 'heading', level: 1, text: 'Quarterly Review' });
    expect(contentNodes[1]).toMatchObject({
      type: 'heading',
      level: 3,
      text: 'Prepared for the board',
    });
    expect(contentNodes[2]).toMatchObject({
      type: 'paragraph',
      text: 'See [**docs**](https://example.com/docs) *note* ~~old~~\na\\*b',
    });
    expect(contentNodes[3]).toMatchObject({
      type: 'paragraph',
      text: 'Right side',
      align: 'right',
    });
    expect(contentNodes[4]).toMatchObject({ type: 'paragraph', text: 'Centered', align: 'center' });
    expect(contentNodes[5]).toMatchObject({
      type: 'paragraph',
      text: '[Ada](mailto:ada@example.com)',
    });
    expect(contentNodes[6]).toMatchObject({ type: 'paragraph', text: 'click' });
    expect(contentNodes[7]).toMatchObject({ type: 'paragraph', text: 'A & B' });
    expect(contentNodes[8]).toMatchObject({
      type: 'list',
      style: 'bullet',
      items: [{ text: '**Parent**', children: [{ text: 'Child', children: [{ text: 'Grand' }] }] }],
    });
    expect(contentNodes[9]).toMatchObject({
      type: 'list',
      style: 'number',
      items: [{ text: 'Numbered' }],
    });
    expect(contentNodes[10]).toMatchObject({
      type: 'table',
      header: true,
      rows: [
        ['**Name**', 'Score'],
        ['Ada', '10'],
      ],
    });
    expect(contentNodes[11]).toMatchObject({
      type: 'table',
      header: true,
      rows: [
        ['A', 'B'],
        ['C', 'D'],
      ],
    });
    expect(contentNodes[12]).toMatchObject({ type: 'table', header: false, rows: [['Only']] });
    expect(contentNodes[13]).toMatchObject({ type: 'heading', level: 2, text: 'Big idea' });
    expect(contentNodes[14]).toMatchObject({ type: 'paragraph', text: 'supporting line' });
    expect(contentNodes[15]).toMatchObject({ type: 'paragraph', text: 'Not a title' });

    const assets = Object.values(doc.assets);
    expect(assets).toHaveLength(3);
    const jpeg = assets.find((asset) => asset.src.startsWith('data:image/jpeg;base64,'));
    const svg = assets.find((asset) => asset.src.startsWith('data:image/svg+xml;base64,'));
    const png = assets.find((asset) => asset.src.startsWith('data:image/png;base64,'));
    expect(jpeg).toMatchObject({ kind: 'image', width: 3, height: 2, alt: 'photo.jpg' });
    expect(svg).toMatchObject({ kind: 'image', alt: 'mark.svg' });
    expect(svg?.width).toBeUndefined();
    expect(png).toMatchObject({ kind: 'image', width: 1, height: 1, alt: 'hero.png' });
    expect(contentNodes[16]).toMatchObject({ type: 'image', assetId: expect.any(String) });
    expect(contentNodes[17]).toMatchObject({ type: 'image', assetId: expect.any(String) });

    expect(beside?.accent).toEqual({ position: 'right', assetId: expect.any(String) });
    expect(beside ? typesOf(beside) : []).toEqual(['heading']);
    expect(walk(beside?.body ?? [])[0]).toMatchObject({
      type: 'heading',
      level: 2,
      text: 'Beside',
    });

    expect(banner?.accent).toEqual({ position: 'top', assetId: beside?.accent?.assetId });
    expect(walk(banner?.body ?? [])[0]).toMatchObject({
      type: 'paragraph',
      text: 'Under the banner',
    });

    expect(columns?.body.map((node) => node.type)).toEqual(['heading', 'columns', 'image']);
    const compare = columns?.body[0];
    const layout = columns?.body[1];
    const tiny = columns?.body[2];
    expect(compare).toMatchObject({ type: 'heading', level: 2, text: 'Compare' });
    expect(layout).toMatchObject({ type: 'columns', widths: [1, 1.5] });
    if (layout?.type === 'columns') {
      expect(layout.children[0]?.[0]).toMatchObject({ type: 'paragraph', text: 'Left column' });
      expect(layout.children[1]?.[0]).toMatchObject({ type: 'paragraph', text: 'Right column' });
    }
    expect(tiny).toMatchObject({ type: 'image', assetId: beside?.accent?.assetId });
    expect(png && beside?.accent?.assetId).toBeTruthy();
    const pngId = Object.entries(doc.assets).find(([, asset]) => asset === png)?.[0];
    expect(beside?.accent?.assetId).toBe(pngId);
  });

  it('maps a grouped picture into a left accent using child coordinates', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const grouped = `<p:grpSp>
      <p:grpSpPr><a:xfrm>
        <a:off x="0" y="0"/><a:ext cx="10000" cy="10000"/>
        <a:chOff x="0" y="0"/><a:chExt cx="100" cy="100"/>
      </a:xfrm></p:grpSpPr>
      ${picture({ x: 0, y: 0, cx: 30, cy: 50, embed: 'rIdHero' })}
      ${textBox({
        x: 60,
        y: 10,
        cx: 30,
        cy: 40,
        paragraphs: `<a:p>${run('Grouped')}</a:p>`,
      })}
    </p:grpSp>`;
    const result = await loaded({
      'ppt/presentation.xml': presentation(['rId1'], size),
      'ppt/_rels/presentation.xml.rels': rels([
        { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': slideXml(grouped, size.cx, size.cy),
      'ppt/slides/_rels/slide1.xml.rels': rels([
        { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
      ]),
      'ppt/media/hero.png': PNG,
    });
    expect(result.doc.cards[0]?.accent?.position).toBe('left');
    expect(typesOf(result.doc.cards[0]!)).toEqual(['paragraph']);
    expect(walk(result.doc.cards[0]!.body)[0]).toMatchObject({ text: 'Grouped' });
  });

  it('promotes a covering picture and a background fill, and keeps an overlapping picture inline', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const covered = slideXml(
      [
        picture({ x: 0, y: 0, cx: 9_000, cy: 9_000, embed: 'rIdHero' }),
        textBox({
          x: 500,
          y: 500,
          cx: 2_000,
          cy: 1_000,
          paragraphs: `<a:p>${run('Overlay')}</a:p>`,
        }),
      ].join(''),
      size.cx,
      size.cy,
    );
    const filled = slideXml(
      textBox({
        x: 0,
        y: 0,
        cx: 4_000,
        cy: 1_000,
        paragraphs: `<a:p>${run('Filled')}</a:p>`,
      }),
      size.cx,
      size.cy,
      '<p:bg><p:bgPr><a:blipFill><a:blip r:embed="rIdHero"/></a:blipFill></p:bgPr></p:bg>',
    );
    const overlap = slideXml(
      [
        picture({ x: 0, y: 0, cx: 4_000, cy: 6_000, embed: 'rIdHero' }),
        textBox({
          x: 2_000,
          y: 1_000,
          cx: 3_000,
          cy: 2_000,
          paragraphs: `<a:p>${run('Overlap')}</a:p>`,
        }),
      ].join(''),
      size.cx,
      size.cy,
    );
    const result = await loaded({
      'ppt/presentation.xml': presentation(['rId1', 'rId2', 'rId3'], size),
      'ppt/_rels/presentation.xml.rels': rels([
        { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
        { id: 'rId2', type: SLIDE, target: 'slides/slide2.xml' },
        { id: 'rId3', type: SLIDE, target: 'slides/slide3.xml' },
      ]),
      'ppt/slides/slide1.xml': covered,
      'ppt/slides/_rels/slide1.xml.rels': rels([
        { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
      ]),
      'ppt/slides/slide2.xml': filled,
      'ppt/slides/_rels/slide2.xml.rels': rels([
        { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
      ]),
      'ppt/slides/slide3.xml': overlap,
      'ppt/slides/_rels/slide3.xml.rels': rels([
        { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
      ]),
      'ppt/media/hero.png': PNG,
    });
    const [backdrop, fill, crowded] = result.doc.cards;
    expect(backdrop?.background).toMatchObject({ kind: 'image' });
    expect(typesOf(backdrop!)).toEqual(['paragraph']);
    expect(fill?.background).toMatchObject({ kind: 'image' });
    expect(typesOf(fill!)).toEqual(['paragraph']);
    expect(crowded?.accent).toBeUndefined();
    expect(typesOf(crowded!)).toEqual(['image', 'paragraph']);
    expect(Object.keys(result.doc.assets)).toHaveLength(1);
    expect(backdrop?.background).toEqual(fill?.background);
  });

  it('sorts slides naturally when the presentation part is missing', async () => {
    const box = (label: string) =>
      slideXml(
        textBox({
          x: 0,
          y: 0,
          cx: 9_000_000,
          cy: 1_000_000,
          ph: 'title',
          paragraphs: `<a:p>${run(label)}</a:p>`,
        }),
        12_192_000,
        6_858_000,
      );
    const result = await loaded({
      'ppt/slides/slide10.xml': box('Ten'),
      'ppt/slides/slide2.xml': box('Two'),
      'ppt/slides/slide1.xml': box('One'),
    });
    expect(walk(result.doc.cards[0]!.body)[0]).toMatchObject({ level: 1, text: 'One' });
    expect(walk(result.doc.cards[1]!.body)[0]).toMatchObject({ level: 2, text: 'Two' });
    expect(walk(result.doc.cards[2]!.body)[0]).toMatchObject({ level: 2, text: 'Ten' });
  });

  it('uses the 16:9 default slide size when sldSz is omitted', async () => {
    const result = await loaded({
      'ppt/presentation.xml': presentation(['rId1']),
      'ppt/_rels/presentation.xml.rels': rels([
        { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': slideXml(
        [
          picture({ x: 0, y: 0, cx: 2_800_000, cy: 3_000_000, embed: 'rIdHero' }),
          textBox({
            x: 6_000_000,
            y: 1_000_000,
            cx: 3_000_000,
            cy: 2_000_000,
            paragraphs: `<a:p>${run('Copy')}</a:p>`,
          }),
        ].join(''),
        12_192_000,
        6_858_000,
      ),
      'ppt/slides/_rels/slide1.xml.rels': rels([
        { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
      ]),
      'ppt/media/hero.png': PNG,
    });
    expect(result.doc.cards[0]?.accent).toBeUndefined();
    expect(typesOf(result.doc.cards[0]!)).toEqual(['columns', 'image', 'paragraph']);
  });

  it('chooses a title from core.xml, the option, the first heading, then a placeholder', async () => {
    const heading = (text: string) =>
      slideXml(
        textBox({
          x: 0,
          y: 0,
          cx: 8_000_000,
          cy: 1_000_000,
          paragraphs: `<a:p>${run(text, 'b="1" sz="3200"')}</a:p>`,
        }),
        12_192_000,
        6_858_000,
      );
    const withCore = await loaded(
      {
        'docProps/core.xml':
          '<?xml version="1.0"?><cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>   </dc:title></cp:coreProperties>',
        ...bare('ppt/slides/slide1.xml', heading('Ignored')),
      },
      { title: 'From file name' },
    );
    expect(withCore.doc.title).toBe('From file name');

    const fromHeading = await loaded(bare('ppt/slides/slide1.xml', heading('Heading')));
    expect(fromHeading.doc.title).toBe('Heading');

    const untitled = await loaded(
      bare(
        'ppt/slides/slide1.xml',
        slideXml(
          textBox({
            x: 0,
            y: 0,
            cx: 4_000_000,
            cy: 1_000_000,
            paragraphs: '<a:p><a:endParaRPr/></a:p>',
          }),
          12_192_000,
          6_858_000,
        ),
      ),
    );
    expect(untitled.doc.title).toBe('UntitledPresentation');
  });

  it('uploads each media path once and keeps the returned dimensions', async () => {
    const calls: string[] = [];
    const slide = (y: number) =>
      slideXml(
        picture({ x: 0, y, cx: 1_000_000, cy: 1_000_000, embed: 'rIdHero' }),
        12_192_000,
        6_858_000,
      );
    const result = await loaded(
      {
        'ppt/presentation.xml': presentation(['rId1', 'rId2'], {
          cx: 12_192_000,
          cy: 6_858_000,
        }),
        'ppt/_rels/presentation.xml.rels': rels([
          { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
          { id: 'rId2', type: SLIDE, target: 'slides/slide2.xml' },
        ]),
        'ppt/slides/slide1.xml': slide(0),
        'ppt/slides/_rels/slide1.xml.rels': rels([
          { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
        ]),
        'ppt/slides/slide2.xml': slide(2_000_000),
        'ppt/slides/_rels/slide2.xml.rels': rels([
          { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
        ]),
        'ppt/media/hero.png': PNG,
      },
      {
        uploadAsset: async (file) => {
          calls.push(`${file.filename}:${file.mimeType}:${file.bytes.length}`);
          return { src: 'https://cdn.example.com/hero.png', width: 12, height: 8, alt: 'Hero' };
        },
      },
    );
    expect(calls).toEqual([`hero.png:image/png:${PNG.length}`]);
    expect(Object.values(result.doc.assets)).toEqual([
      { kind: 'image', src: 'https://cdn.example.com/hero.png', alt: 'Hero', width: 12, height: 8 },
    ]);
    const first = walk(result.doc.cards[0]!.body)[0];
    const second = walk(result.doc.cards[1]!.body)[0];
    expect(first).toMatchObject({ type: 'image' });
    expect(second).toMatchObject({
      type: 'image',
      assetId: first && 'assetId' in first ? first.assetId : '',
    });
  });

  it('reads a deflated package and skips a slide that is not xml', async () => {
    const kept = slideXml(
      textBox({
        x: 0,
        y: 0,
        cx: 8_000_000,
        cy: 1_000_000,
        ph: 'title',
        paragraphs: `<a:p>${run('Kept')}</a:p>`,
      }),
      12_192_000,
      6_858_000,
    );
    const result = await loaded(
      {
        'ppt/presentation.xml': presentation(['rId1', 'rId2'], { cx: 12_192_000, cy: 6_858_000 }),
        'ppt/_rels/presentation.xml.rels': rels([
          { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
          { id: 'rId2', type: SLIDE, target: 'slides/slide2.xml' },
        ]),
        'ppt/slides/slide1.xml': 'this is not xml',
        'ppt/slides/slide2.xml': kept,
      },
      { compress: true },
    );
    expect(result.warnings).toEqual(['Skipped unreadable slide "ppt/slides/slide1.xml".']);
    expect(walk(result.doc.cards[0]!.body)[0]).toMatchObject({ text: 'Kept' });
  });

  it('rejects inputs that are not a deck', async () => {
    const garbage = await importPptx(Uint8Array.of(1, 2, 3, 4));
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.error).toMatch(/ZIP/);

    const empty = await importPptx(
      await createZip({ 'ppt/presentation.xml': '<p:presentation/>' }),
    );
    expect(empty).toEqual({ ok: false, error: 'No slides found in the PowerPoint file.' });
  });
});

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bare(path: string, xml: string): Record<string, string> {
  return { [path]: xml };
}
