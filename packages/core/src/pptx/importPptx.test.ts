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
const LAYOUT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';

async function load(
  entries: Record<string, string | Uint8Array>,
  options?: ImportPptxOptions & { compress?: boolean },
) {
  const { compress, ...importOptions } = options ?? {};
  const zip = await createZip(entries, { compress });
  const result = await importPptx(new Uint8Array(zip).buffer, {
    mode: 'flow',
    ...importOptions,
  });
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

function filledShape(options: {
  x: number;
  y: number;
  cx: number;
  cy: number;
  fill: string;
}): string {
  return `<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr>
    <p:spPr>
      <a:xfrm><a:off x="${options.x}" y="${options.y}"/><a:ext cx="${options.cx}" cy="${options.cy}"/></a:xfrm>
      <a:prstGeom prst="roundRect"/>
      <a:solidFill><a:srgbClr val="${options.fill}"/></a:solidFill>
    </p:spPr>
    <p:txBody><a:bodyPr/><a:p/></p:txBody>
  </p:sp>`;
}

function svgPicture(options: {
  x: number;
  y: number;
  cx: number;
  cy: number;
  embed: string;
}): string {
  return `<p:pic><p:nvPicPr/>
    <p:blipFill><a:blip><a:extLst><a:ext><asvg:svgBlip r:embed="${options.embed}"/></a:ext></a:extLst></a:blip></p:blipFill>
    <p:spPr><a:xfrm><a:off x="${options.x}" y="${options.y}"/><a:ext cx="${options.cx}" cy="${options.cy}"/></a:xfrm></p:spPr>
  </p:pic>`;
}

function coloredRun(text: string, hex: string, props = ''): string {
  const extra = props ? ` ${props}` : '';
  return `<a:r><a:rPr${extra}><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r>`;
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
    expect(doc.looma).toBe(2);
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

    expect(columns?.body.map((node) => node.type)).toEqual(['heading', 'columns']);
    const compare = columns?.body[0];
    const layout = columns?.body[1];
    expect(compare).toMatchObject({ type: 'heading', level: 2, text: 'Compare' });
    expect(layout).toMatchObject({ type: 'columns', widths: [1, 1.5] });
    if (layout?.type === 'columns') {
      expect(layout.children[0]?.[0]).toMatchObject({ type: 'paragraph', text: 'Left column' });
      expect(layout.children[0]?.[1]).toMatchObject({
        type: 'image',
        assetId: beside?.accent?.assetId,
      });
      expect(layout.children[1]?.[0]).toMatchObject({ type: 'paragraph', text: 'Right column' });
    }
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

  it('promotes a full-slide cream shape to the card background and the warm preset', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const slide = (label: string) =>
      slideXml(
        [
          filledShape({ x: 0, y: 0, cx: 10_000, cy: 10_000, fill: 'FFF9EF' }),
          textBox({
            x: 500,
            y: 2_000,
            cx: 4_000,
            cy: 800,
            paragraphs: `<a:p>${run(label, 'b="1" sz="2800"')}</a:p>`,
          }),
        ].join(''),
        size.cx,
        size.cy,
      );
    const result = await loaded({
      'ppt/presentation.xml': presentation(['rId1', 'rId2'], size),
      'ppt/_rels/presentation.xml.rels': rels([
        { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
        { id: 'rId2', type: SLIDE, target: 'slides/slide2.xml' },
      ]),
      'ppt/slides/slide1.xml': slide('漢字樂園'),
      'ppt/slides/slide2.xml': slide('第二頁'),
    });
    expect(result.doc.theme).toEqual({ preset: 'warm' });
    expect(result.doc.cards.map((card) => card.background)).toEqual([
      { kind: 'color', value: '#fff9ef' },
      { kind: 'color', value: '#fff9ef' },
    ]);
    expect(walk(result.doc.cards[0]!.body)[0]).toMatchObject({
      type: 'heading',
      level: 2,
      text: '**漢字樂園**',
    });
  });

  it('keeps an explicit theme preset and stores a shared non-cream background as an override', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const slide = slideXml(
      [
        filledShape({ x: 0, y: 0, cx: 10_000, cy: 10_000, fill: '123456' }),
        textBox({
          x: 500,
          y: 2_000,
          cx: 3_000,
          cy: 600,
          paragraphs: `<a:p>${run('Navy')}</a:p>`,
        }),
      ].join(''),
      size.cx,
      size.cy,
    );
    const locked = await loaded(
      {
        'ppt/presentation.xml': presentation(['rId1'], size),
        'ppt/_rels/presentation.xml.rels': rels([
          { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
        ]),
        'ppt/slides/slide1.xml': slide,
      },
      { themePreset: 'clean' },
    );
    expect(locked.doc.theme).toEqual({ preset: 'clean' });
    expect(locked.doc.cards[0]?.background).toEqual({ kind: 'color', value: '#123456' });

    const shared = await loaded({
      'ppt/presentation.xml': presentation(['rId1', 'rId2'], size),
      'ppt/_rels/presentation.xml.rels': rels([
        { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
        { id: 'rId2', type: SLIDE, target: 'slides/slide2.xml' },
      ]),
      'ppt/slides/slide1.xml': slide,
      'ppt/slides/slide2.xml': slide,
    });
    expect(shared.doc.theme).toEqual({
      preset: 'clean',
      overrides: { cardBackground: '#123456' },
    });
  });

  it('reads gradient fills and a layout background', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const gradient = slideXml(
      textBox({
        x: 400,
        y: 400,
        cx: 3_000,
        cy: 600,
        paragraphs: `<a:p>${run('Fade')}</a:p>`,
      }),
      size.cx,
      size.cy,
      `<p:bg><p:bgPr><a:gradFill><a:gsLst>
        <a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs>
        <a:gs pos="100000"><a:srgbClr val="FBBF24"/></a:gs>
      </a:gsLst><a:lin ang="2700000"/></a:gradFill></p:bgPr></p:bg>`,
    );
    const fromLayout = slideXml(
      textBox({
        x: 400,
        y: 400,
        cx: 3_000,
        cy: 600,
        paragraphs: `<a:p>${run('Layout')}</a:p>`,
      }),
      size.cx,
      size.cy,
    );
    const result = await loaded(
      {
        'ppt/presentation.xml': presentation(['rId1', 'rId2'], size),
        'ppt/_rels/presentation.xml.rels': rels([
          { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
          { id: 'rId2', type: SLIDE, target: 'slides/slide2.xml' },
        ]),
        'ppt/slides/slide1.xml': gradient,
        'ppt/slides/slide2.xml': fromLayout,
        'ppt/slides/_rels/slide2.xml.rels': rels([
          { id: 'rIdLayout', type: LAYOUT, target: '../slideLayouts/slideLayout1.xml' },
        ]),
        'ppt/slideLayouts/slideLayout1.xml': `<?xml version="1.0"?>
<p:sldLayout xmlns:a="urn:a" xmlns:p="urn:p"><p:cSld>
  <p:bg><p:bgPr><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill></p:bgPr></p:bg>
</p:cSld></p:sldLayout>`,
      },
      { themePreset: 'clean' },
    );
    expect(result.doc.cards[0]?.background).toEqual({
      kind: 'gradient',
      from: '#ffffff',
      to: '#fbbf24',
      angle: 135,
    });
    expect(result.doc.cards[1]?.background).toEqual({ kind: 'color', value: '#abcdef' });
    expect(result.doc.theme).toEqual({ preset: 'clean' });
  });

  it('embeds an svg blip and drops tiny decorative icons', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const result = await loaded({
      'ppt/presentation.xml': presentation(['rId1'], size),
      'ppt/_rels/presentation.xml.rels': rels([
        { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': slideXml(
        [
          svgPicture({ x: 500, y: 500, cx: 400, cy: 400, embed: 'rIdTiny' }),
          svgPicture({ x: 1_000, y: 1_200, cx: 2_000, cy: 2_000, embed: 'rIdMark' }),
          textBox({
            x: 4_000,
            y: 1_500,
            cx: 3_000,
            cy: 600,
            paragraphs: `<a:p>${run('Kept')}</a:p>`,
          }),
        ].join(''),
        size.cx,
        size.cy,
      ),
      'ppt/slides/_rels/slide1.xml.rels': rels([
        { id: 'rIdTiny', type: IMAGE, target: '../media/tiny.svg' },
        { id: 'rIdMark', type: IMAGE, target: '../media/mark.svg' },
      ]),
      'ppt/media/tiny.svg': SVG,
      'ppt/media/mark.svg': SVG,
    });
    expect(typesOf(result.doc.cards[0]!)).toEqual(['columns', 'image', 'paragraph']);
    expect(Object.values(result.doc.assets)).toEqual([
      expect.objectContaining({ kind: 'image', alt: 'mark.svg' }),
    ]);
    expect(JSON.stringify(result.doc)).not.toContain('tiny.svg');
  });

  it('maps run colors, pill highlights, heading sizes, footers, and corner badges', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const result = await loaded({
      'ppt/presentation.xml': presentation(['rId1'], size),
      'ppt/_rels/presentation.xml.rels': rels([
        { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': slideXml(
        [
          filledShape({ x: 400, y: 2_800, cx: 1_500, cy: 600, fill: 'E3F0FF' }),
          textBox({
            x: 500,
            y: 2_900,
            cx: 1_100,
            cy: 300,
            paragraphs: `<a:p>${coloredRun('LESSON 01', '1D4ED8', 'b="1" sz="1350"')}</a:p>`,
          }),
          filledShape({ x: 1_600, y: 2_800, cx: 1_200, cy: 600, fill: 'FFFFFF' }),
          textBox({
            x: 1_680,
            y: 2_920,
            cx: 800,
            cy: 280,
            paragraphs: `<a:p>${coloredRun('識字寫字', '8A7E6E', 'b="1" sz="1200"')}</a:p>`,
          }),
          textBox({
            x: 400,
            y: 3_600,
            cx: 5_000,
            cy: 700,
            paragraphs: `<a:p>${coloredRun('漢字樂園', '3D3327', 'b="1" sz="4650"')}</a:p>`,
          }),
          textBox({
            x: 400,
            y: 4_500,
            cx: 5_000,
            cy: 400,
            paragraphs: `<a:p>${coloredRun('Fun with Chinese Characters', '1D4ED8', 'b="1" sz="2175"')}</a:p>`,
          }),
          textBox({
            x: 400,
            y: 5_100,
            cx: 5_000,
            cy: 400,
            paragraphs: `<a:p>${coloredRun('漢字像積木', '8A7E6E', 'sz="1500"')}</a:p>`,
          }),
          textBox({
            x: 400,
            y: 5_700,
            cx: 4_000,
            cy: 400,
            paragraphs: `<a:p>${coloredRun('本課重點：認識獨體字', 'FB6E6E', 'b="1" sz="1425"')}</a:p>`,
          }),
          textBox({
            x: 9_000,
            y: 400,
            cx: 500,
            cy: 300,
            paragraphs: `<a:p>${coloredRun('01', '1D4ED8', 'b="1" sz="1425"')}</a:p>`,
          }),
          textBox({
            x: 400,
            y: 9_200,
            cx: 4_000,
            cy: 200,
            paragraphs: `<a:p>${coloredRun('小學三年級中文 · 第01課', '8A7E6E', 'sz="1050"')}</a:p>`,
          }),
          textBox({
            x: 8_200,
            y: 9_200,
            cx: 1_200,
            cy: 200,
            paragraphs: `<a:p>${run('02 / 10', 'sz="1050"')}</a:p>`,
          }),
        ].join(''),
        size.cx,
        size.cy,
      ),
    });
    const body = result.doc.cards[0]?.body ?? [];
    expect(body.map((node) => node.type)).toEqual([
      'paragraph',
      'heading',
      'heading',
      'paragraph',
      'callout',
    ]);
    expect(body[0]).toMatchObject({
      type: 'paragraph',
      text: '{highlight:blue}{color:primary}**LESSON 01**{/color}{/highlight}   {highlight:gray}{color:muted}**識字寫字**{/color}{/highlight}',
    });
    expect(body[1]).toMatchObject({ type: 'heading', level: 1, text: '**漢字樂園**' });
    expect(body[2]).toMatchObject({
      type: 'heading',
      level: 3,
      text: '{color:primary}**Fun with Chinese Characters**{/color}',
    });
    expect(body[3]).toMatchObject({ type: 'paragraph', text: '{color:muted}漢字像積木{/color}' });
    expect(body[4]).toMatchObject({
      type: 'callout',
      tone: 'danger',
      text: '{color:danger}**本課重點：認識獨體字**{/color}',
    });
    expect(JSON.stringify(body)).not.toContain('小學三年級');
    expect(JSON.stringify(body)).not.toContain('02 / 10');
    expect(JSON.stringify(body)).not.toContain('"01"');
  });

  it('merges a header with its subtitle and groups side-by-side panels', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const panel = (x: number, title: string, hex: string) =>
      [
        filledShape({ x, y: 2_500, cx: 2_800, cy: 4_000, fill: 'FFFFFF' }),
        textBox({
          x: x + 200,
          y: 3_000,
          cx: 2_000,
          cy: 400,
          paragraphs: `<a:p>${coloredRun(title, hex, 'b="1" sz="1575"')}</a:p>`,
        }),
        textBox({
          x: x + 200,
          y: 3_600,
          cx: 2_200,
          cy: 500,
          paragraphs: `<a:p>${coloredRun(`${title}說明`, '3D3327', 'sz="1350"')}</a:p>`,
        }),
      ].join('');
    const result = await loaded({
      'ppt/presentation.xml': presentation(['rId1'], size),
      'ppt/_rels/presentation.xml.rels': rels([
        { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': slideXml(
        [
          textBox({
            x: 200,
            y: 400,
            cx: 1_600,
            cy: 400,
            paragraphs: `<a:p>${coloredRun('學習目標', '3D3327', 'b="1" sz="2550"')}</a:p>`,
          }),
          textBox({
            x: 2_000,
            y: 480,
            cx: 1_800,
            cy: 300,
            paragraphs: `<a:p>${coloredRun('Learning Objectives', '8A7E6E', 'sz="1275"')}</a:p>`,
          }),
          panel(200, '認一認', '2F80ED'),
          panel(3_400, '拆一拆', '2DD4A7'),
          panel(6_600, '記一記', 'FBBF24'),
        ].join(''),
        size.cx,
        size.cy,
      ),
    });
    const body = result.doc.cards[0]?.body ?? [];
    expect(body.map((node) => node.type)).toEqual(['heading', 'columns']);
    expect(body[0]).toMatchObject({
      type: 'heading',
      level: 2,
      text: '**學習目標** {color:muted}Learning Objectives{/color}',
    });
    const columns = body[1];
    expect(columns).toMatchObject({ type: 'columns', widths: [1, 1, 1] });
    if (columns?.type === 'columns') {
      expect(columns.children[0]?.[0]).toMatchObject({
        text: '{color:primary}**認一認**{/color}',
      });
      expect(columns.children[1]?.[0]).toMatchObject({
        text: '{color:success}**拆一拆**{/color}',
      });
      expect(columns.children[2]?.[0]).toMatchObject({
        text: '{color:warning}**記一記**{/color}',
      });
      expect(columns.children).toHaveLength(3);
    }
  });

  it('builds zone columns, numbered steps, and banner callouts', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const step = (n: string, y: number, answer?: { text: string; fill: string; hex: string }) => {
      const parts = [
        filledShape({ x: 400, y: y - 40, cx: 360, cy: 360, fill: 'E3F0FF' }),
        textBox({
          x: 480,
          y,
          cx: 200,
          cy: 280,
          paragraphs: `<a:p>${coloredRun(n, '1D4ED8', 'b="1" sz="1350"')}</a:p>`,
        }),
        textBox({
          x: 1_000,
          y: y - 20,
          cx: 2_600,
          cy: 320,
          paragraphs: `<a:p>${coloredRun(`問題${n}`, '3D3327', 'sz="1350"')}</a:p>`,
        }),
      ];
      if (answer) {
        parts.push(
          filledShape({ x: 3_650, y: y - 40, cx: 800, cy: 360, fill: answer.fill }),
          textBox({
            x: 3_700,
            y,
            cx: 600,
            cy: 280,
            paragraphs: `<a:p>${coloredRun(answer.text, answer.hex, 'b="1" sz="1200"')}</a:p>`,
          }),
        );
      }
      return parts.join('');
    };
    const result = await loaded({
      'ppt/presentation.xml': presentation(['rId1', 'rId2'], size),
      'ppt/_rels/presentation.xml.rels': rels([
        { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
        { id: 'rId2', type: SLIDE, target: 'slides/slide2.xml' },
      ]),
      'ppt/slides/slide1.xml': slideXml(
        [
          textBox({
            x: 200,
            y: 1_800,
            cx: 4_000,
            cy: 700,
            paragraphs: `<a:p>${coloredRun('漢字樂園', '3D3327', 'b="1" sz="4650"')}</a:p>`,
          }),
          textBox({
            x: 200,
            y: 5_200,
            cx: 3_600,
            cy: 500,
            paragraphs: `<a:p>${run('左欄收尾')}</a:p>`,
          }),
          picture({ x: 6_200, y: 1_600, cx: 3_000, cy: 2_500, embed: 'rIdHero' }),
          filledShape({ x: 6_300, y: 4_550, cx: 1_400, cy: 500, fill: 'E3F0FF' }),
          textBox({
            x: 6_400,
            y: 4_600,
            cx: 1_200,
            cy: 400,
            paragraphs: `<a:p>${coloredRun('字', '1D4ED8', 'b="1" sz="1800"')}</a:p>`,
          }),
          textBox({
            x: 7_700,
            y: 4_650,
            cx: 1_400,
            cy: 350,
            paragraphs: `<a:p>${coloredRun('字形結構', '3D3327', 'b="1" sz="1500"')}</a:p>`,
          }),
        ].join(''),
        size.cx,
        size.cy,
      ),
      'ppt/slides/_rels/slide1.xml.rels': rels([
        { id: 'rIdHero', type: IMAGE, target: '../media/hero.png' },
      ]),
      'ppt/slides/slide2.xml': slideXml(
        [
          step('1', 2_000),
          step('2', 2_800),
          step('3', 3_600, { text: '日＋月', fill: 'EAFBF4', hex: '047857' }),
          filledShape({ x: 400, y: 7_800, cx: 9_200, cy: 1_400, fill: 'FFF4D9' }),
          textBox({
            x: 800,
            y: 8_100,
            cx: 8_000,
            cy: 400,
            paragraphs: `<a:p>${coloredRun('口訣：一看二拆', '3D3327', 'sz="1350"')}</a:p>`,
          }),
        ].join(''),
        size.cx,
        size.cy,
      ),
      'ppt/media/hero.png': PNG,
    });
    const [zoned, stepped] = result.doc.cards;
    expect(zoned?.body.map((node) => node.type)).toEqual(['columns']);
    const columns = zoned?.body[0];
    expect(columns).toMatchObject({ type: 'columns' });
    if (columns?.type === 'columns') {
      expect(columns.children[0]?.map((node) => node.type)).toEqual(['heading', 'paragraph']);
      expect(columns.children[0]?.[0]).toMatchObject({
        type: 'heading',
        level: 1,
        text: '**漢字樂園**',
      });
      expect(columns.children[0]?.[1]).toMatchObject({ type: 'paragraph', text: '左欄收尾' });
      expect(columns.children[1]?.map((node) => node.type)).toEqual(['image', 'paragraph']);
      expect(columns.children[1]?.[1]).toMatchObject({
        type: 'paragraph',
        text: '{highlight:blue}{color:primary}**字**{/color}{/highlight}   **字形結構**',
      });
    }
    expect(stepped?.body.map((node) => node.type)).toEqual(['steps', 'callout']);
    const steps = stepped?.body[0];
    expect(steps).toMatchObject({ type: 'steps' });
    if (steps?.type === 'steps') {
      expect(steps.children.map((node) => (node.type === 'paragraph' ? node.text : ''))).toEqual([
        '問題1',
        '問題2',
        '問題3   {highlight:green}{color:success}**日＋月**{/color}{/highlight}',
      ]);
    }
    expect(stepped?.body[1]).toMatchObject({
      type: 'callout',
      tone: 'warning',
      text: '口訣：一看二拆',
    });
  });

  it('resolves a scheme color used by a full-slide shape', async () => {
    const size = { cx: 10_000, cy: 10_000 };
    const result = await loaded(
      {
        'ppt/theme/theme1.xml': `<?xml version="1.0"?>
<a:theme xmlns:a="urn:a"><a:themeElements><a:clrScheme name="Office">
  <a:accent1><a:srgbClr val="112233"/></a:accent1>
</a:clrScheme></a:themeElements></a:theme>`,
        'ppt/presentation.xml': presentation(['rId1'], size),
        'ppt/_rels/presentation.xml.rels': rels([
          { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
        ]),
        'ppt/slides/slide1.xml': slideXml(
          [
            `<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="10000" cy="10000"/></a:xfrm>
              <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
            </p:spPr></p:sp>`,
            textBox({
              x: 400,
              y: 400,
              cx: 2_000,
              cy: 400,
              paragraphs: `<a:p>${run('Scheme')}</a:p>`,
            }),
          ].join(''),
          size.cx,
          size.cy,
        ),
      },
      { themePreset: 'serif' },
    );
    expect(result.doc.theme.preset).toBe('serif');
    expect(result.doc.cards[0]?.background).toEqual({ kind: 'color', value: '#112233' });
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

  describe('default scene mode (original layout preservation)', () => {
    it('imports slides into scene mode by default while preserving 16:9, 4:3, and custom aspect ratios', async () => {
      for (const item of [
        { cx: 12_192_000, cy: 6_858_000, expectedW: 1280, expectedH: 720 },
        { cx: 9_144_000, cy: 6_858_000, expectedW: 960, expectedH: 720 },
        { cx: 10_800_000, cy: 10_800_000, expectedW: 1134, expectedH: 1134 },
      ]) {
        const zip = await createZip({
          'ppt/presentation.xml': presentation(['rId1'], { cx: item.cx, cy: item.cy }),
          'ppt/_rels/presentation.xml.rels': rels([
            { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
          ]),
          'ppt/slides/slide1.xml': slideXml(
            textBox({
              x: 952_500,
              y: 952_500,
              cx: 3_810_000,
              cy: 952_500,
              paragraphs: `<a:p><a:r><a:rPr sz="2400" b="1"><a:solidFill><a:srgbClr val="1D4ED8"/></a:solidFill><a:latin typeface="Poppins"/></a:rPr><a:t>Scene Title</a:t></a:r></a:p>`,
            }),
            item.cx,
            item.cy,
          ),
        });
        const res = await importPptx(zip);
        expect(res.ok).toBe(true);
        if (!res.ok) continue;
        expect(res.doc.looma).toBe(2);
        const card = res.doc.cards[0];
        expect(card?.layout).toBe('scene');
        expect(card?.body).toEqual([]);
        expect(card?.scene?.width).toBe(item.expectedW);
        expect(card?.scene?.height).toBe(item.expectedH);
      }
    });

    it('preserves empty decorative shapes, bleed circles with alpha, separate frame shape, cropped image, tiny SVG icons, and mixed runs', async () => {
      const cx = 12_192_000;
      const cy = 6_858_000;
      const zip = await createZip({
        'ppt/presentation.xml': presentation(['rId1'], { cx, cy }),
        'ppt/_rels/presentation.xml.rels': rels([
          { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
        ]),
        'ppt/slides/_rels/slide1.xml.rels': rels([
          { id: 'rIdSvg', type: IMAGE, target: 'media/icon.svg' },
          { id: 'rIdPng', type: IMAGE, target: 'media/hero.png' },
        ]),
        'ppt/slides/media/icon.svg': SVG,
        'ppt/slides/media/hero.png': PNG,
        'ppt/slides/slide1.xml': slideXml(
          [
            // 0: Full-bleed cream background shape
            `<p:sp><p:nvSpPr><p:cNvPr id="2" name="bg"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="FFF9EF"/></a:solidFill>
              </p:spPr>
              <p:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p></p:txBody>
            </p:sp>`,
            // 1: Bleed pastel circle with alpha 20%
            `<p:sp><p:nvSpPr><p:cNvPr id="3" name="circle"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="8858250" y="-1428750"/><a:ext cx="4476750" cy="4476750"/></a:xfrm>
                <a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>
                <a:solidFill><a:srgbClr val="FBBF24"><a:alpha val="20000"/></a:srgbClr></a:solidFill>
              </p:spPr>
              <p:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p></p:txBody>
            </p:sp>`,
            // 2: Separate white rounded frame with light-blue stroke
            `<p:sp><p:nvSpPr><p:cNvPr id="4" name="frame"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="7372350" y="1714500"/><a:ext cx="4114800" cy="2819400"/></a:xfrm>
                <a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 9459"/></a:avLst></a:prstGeom>
                <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
                <a:ln w="63500"><a:solidFill><a:srgbClr val="E3F0FF"/></a:solidFill></a:ln>
              </p:spPr>
              <p:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p></p:txBody>
            </p:sp>`,
            // 3: Cropped raster picture inside its own roundRect (must NOT merge with frame)
            `<p:pic>
              <p:nvPicPr><p:cNvPr id="5" name="hero"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
              <p:blipFill>
                <a:blip r:embed="rIdPng"/>
                <a:srcRect l="0" t="618" r="0" b="618"/>
                <a:stretch><a:fillRect/></a:stretch>
              </p:blipFill>
              <p:spPr>
                <a:xfrm><a:off x="7505700" y="1857375"/><a:ext cx="3848100" cy="2533650"/></a:xfrm>
                <a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 7519"/></a:avLst></a:prstGeom>
              </p:spPr>
            </p:pic>`,
            // 4: Tiny SVG icon (190500x190500 EMU = 20x20 px, < 6% slide width)
            `<p:pic>
              <p:nvPicPr><p:cNvPr id="6" name="tiny-svg"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
              <p:blipFill>
                <a:blip><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdSvg"/></a:ext></a:extLst></a:blip>
              </p:blipFill>
              <p:spPr>
                <a:xfrm><a:off x="666750" y="4876800"/><a:ext cx="190500" cy="190500"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </p:spPr>
            </p:pic>`,
            // 5: Text box with mixed runs, exact hex colors, line spacing 145%, and zero insets
            `<p:sp><p:nvSpPr><p:cNvPr id="7" name="mixed-text"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="666750" y="2286000"/><a:ext cx="6438900" cy="838200"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </p:spPr>
              <p:txBody>
                <a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>
                <a:p>
                  <a:pPr algn="ctr"><a:lnSpc><a:spcPct val="145000"/></a:lnSpc></a:pPr>
                  <a:r>
                    <a:rPr sz="4650" b="1"><a:solidFill><a:srgbClr val="3D3327"/></a:solidFill><a:latin typeface="Poppins"/></a:rPr>
                    <a:t>漢字樂園</a:t>
                  </a:r>
                  <a:r>
                    <a:rPr sz="1800" i="1"><a:solidFill><a:srgbClr val="8A7E6E"/></a:solidFill><a:latin typeface="Poppins"/></a:rPr>
                    <a:t> Learning</a:t>
                  </a:r>
                </a:p>
              </p:txBody>
            </p:sp>`,
          ].join(''),
          cx,
          cy,
        ),
      });

      const res = await importPptx(zip);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const card = res.doc.cards[0]!;
      expect(card.background).toEqual({ kind: 'color', value: '#fff9ef' });
      expect(Object.keys(res.doc.assets)).toHaveLength(2);

      const elements = card.scene!.elements;
      expect(elements).toHaveLength(6);

      // Bleed circle with alpha 0.2
      const circle = elements[1]!;
      expect(circle.type).toBe('shape');
      expect(circle.box.y).toBe(-150);
      if (circle.type === 'shape') {
        expect(circle.geometry).toEqual({ preset: 'roundRect', cornerRadiusRatio: 0.5 });
        expect(circle.fill).toEqual({ kind: 'color', color: '#fbbf24', opacity: 0.2 });
      }

      // Separate frame shape (elements[2]) vs Cropped image (elements[3])
      const frame = elements[2]!;
      const hero = elements[3]!;
      expect(frame.type).toBe('shape');
      if (frame.type === 'shape') {
        expect(frame.fill).toEqual({ kind: 'color', color: '#ffffff' });
        expect(frame.stroke?.color).toBe('#e3f0ff');
        expect(frame.stroke?.width).toBeCloseTo(6.67, 1);
      }
      expect(hero.type).toBe('image');
      if (hero.type === 'image') {
        expect(hero.crop).toEqual({ left: 0, top: 0.00618, right: 0, bottom: 0.00618 });
        expect(hero.geometry?.preset).toBe('roundRect');
        expect(hero.geometry?.cornerRadiusRatio).toBeCloseTo(0.07519, 4);
      }

      // Tiny SVG icon preserved
      const tiny = elements[4]!;
      expect(tiny.type).toBe('image');
      expect(tiny.box).toEqual({ x: 70, y: 512, width: 20, height: 20 });

      // Text element with mixed runs, padding 0, verticalAlign middle, lineSpacing 1.45
      const textEl = elements[5]!;
      expect(textEl.type).toBe('text');
      if (textEl.type === 'text') {
        expect(textEl.wordWrap).toBe(false);
        expect(textEl.verticalAlign).toBe('middle');
        expect(textEl.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
        const p = textEl.paragraphs[0]!;
        expect(p.align).toBe('center');
        expect(p.lineSpacing).toEqual({ kind: 'multiple', value: 1.45 });
        expect(p.runs).toEqual([
          {
            text: '漢字樂園',
            fontFamily: 'Poppins',
            fontSize: 62,
            color: '#3d3327',
            bold: true,
          },
          {
            text: ' Learning',
            fontFamily: 'Poppins',
            fontSize: 24,
            color: '#8a7e6e',
            italic: true,
          },
        ]);
      }
    });

    it('reports unsupported graphics, media, and custom geometry in structured diagnostics without silent drops', async () => {
      const cx = 12_192_000;
      const cy = 6_858_000;
      const zip = await createZip({
        'ppt/presentation.xml': presentation(['rId1'], { cx, cy }),
        'ppt/_rels/presentation.xml.rels': rels([
          { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
        ]),
        'ppt/slides/slide1.xml': slideXml(
          [
            `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="10" name="Chart 1"/></p:nvGraphicFramePr><a:graphic/></p:graphicFrame>`,
            `<p:sp><p:nvSpPr><p:cNvPr id="11" name="Freeform 2"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="95250" y="95250"/><a:ext cx="952500" cy="952500"/></a:xfrm>
                <a:custGeom><a:pathLst/></a:custGeom>
                <a:solidFill><a:srgbClr val="2DD4A7"/></a:solidFill>
              </p:spPr>
            </p:sp>`,
          ].join(''),
          cx,
          cy,
        ),
      });

      const res = await importPptx(zip);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slideIndex: 0,
            elementName: 'Chart 1',
            kind: 'unsupported-graphic',
          }),
          expect.objectContaining({
            slideIndex: 0,
            elementName: 'Freeform 2',
            kind: 'custom-geometry-fallback',
          }),
        ]),
      );
    });

    it('preserves zero-height/zero-width lines, default OOXML bodyPr insets (9.6/4.8px) vs explicit 0, and per-attribute defRPr inheritance/override', async () => {
      const cx = 12_192_000;
      const cy = 6_858_000;
      const zip = await createZip({
        'ppt/presentation.xml': presentation(['rId1'], { cx, cy }),
        'ppt/_rels/presentation.xml.rels': rels([
          { id: 'rId1', type: SLIDE, target: 'slides/slide1.xml' },
        ]),
        'ppt/slides/slide1.xml': slideXml(
          [
            // 1. Horizontal line with cy="0"
            `<p:sp><p:nvSpPr><p:cNvPr id="20" name="HorizLine"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="952500" y="1905000"/><a:ext cx="2857500" cy="0"/></a:xfrm>
                <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
                <a:ln w="19050"><a:solidFill><a:srgbClr val="FBBF24"/></a:solidFill></a:ln>
              </p:spPr>
            </p:sp>`,
            // 2. TextBox with <a:bodyPr/> (no explicit insets -> defaults to 9.6 / 4.8 px) and defRPr inheritance + override
            `<p:sp><p:nvSpPr><p:cNvPr id="21" name="DefRPrText"/><p:nvPr/></p:nvSpPr>
              <p:spPr>
                <a:xfrm><a:off x="952500" y="2857500"/><a:ext cx="3810000" cy="952500"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </p:spPr>
              <p:txBody>
                <a:bodyPr/>
                <a:p>
                  <a:pPr>
                    <a:defRPr sz="2400" b="1" u="sng" strike="sngStrike" baseline="30000" spc="150">
                      <a:solidFill><a:srgbClr val="1D4ED8"/></a:solidFill>
                      <a:latin typeface="Poppins"/>
                    </a:defRPr>
                  </a:pPr>
                  <a:r>
                    <a:rPr i="1"/>
                    <a:t>InheritedBoldAndSize</a:t>
                  </a:r>
                  <a:r>
                    <a:rPr b="0" u="none" strike="noStrike" baseline="0" spc="0"/>
                    <a:t>ExplicitlyCleared</a:t>
                  </a:r>
                </a:p>
              </p:txBody>
            </p:sp>`,
          ].join(''),
          cx,
          cy,
        ),
      });

      const res = await importPptx(zip);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const elements = res.doc.cards[0]!.scene!.elements;
      expect(elements).toHaveLength(2);

      const lineEl = elements[0]!;
      expect(lineEl.type).toBe('shape');
      if (lineEl.type === 'shape') {
        expect(lineEl.geometry.preset).toBe('line');
        expect(lineEl.box).toEqual({ x: 100, y: 200, width: 300, height: 2 });
        expect(lineEl.stroke).toEqual({ color: '#fbbf24', width: 2 });
      }

      const textEl = elements[1]!;
      expect(textEl.type).toBe('text');
      if (textEl.type === 'text') {
        expect(textEl.padding).toEqual({ left: 9.6, top: 4.8, right: 9.6, bottom: 4.8 });
        const runs = textEl.paragraphs[0]!.runs;
        expect(runs[0]).toEqual({
          text: 'InheritedBoldAndSize',
          fontFamily: 'Poppins',
          fontSize: 32,
          color: '#1d4ed8',
          bold: true,
          italic: true,
          underline: true,
          strike: true,
          baseline: 'super',
          letterSpacing: 2,
        });
        expect(runs[1]).toEqual({
          text: 'ExplicitlyCleared',
          fontFamily: 'Poppins',
          fontSize: 32,
          color: '#1d4ed8',
        });
      }
    });
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
