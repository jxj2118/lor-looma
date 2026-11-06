import { describe, expect, it } from 'vitest';
import { createZip, importDocx, parseDocument } from '../index';

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

function buildLessonPlanDocxXml(): Record<string, string | Uint8Array> {
  return {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>《鸡兔同笼》教学设计</dc:title>
</cp:coreProperties>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png"/>
  <Relationship Id="rIdLink1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/math" TargetMode="External"/>
</Relationships>`,
    'word/media/diagram.png': PNG,
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:color w:val="2E2A26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="3B82F6"/><w:sz w:val="45"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="3B82F6"/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="FB7185"/><w:sz w:val="25"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:pPr><w:outlineLvl w:val="3"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="3B82F6"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListNumber">
    <w:name w:val="List Number"/>
    <w:pPr><w:numPr><w:numId w:val="5"/></w:numPr></w:pPr>
  </w:style>
</w:styles>`,
    'word/numbering.xml': `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="8">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="7">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="8"/></w:num>
  <w:num w:numId="5"><w:abstractNumId w:val="7"/></w:num>
</w:numbering>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:color w:val="3B82F6"/><w:sz w:val="45"/></w:rPr><w:t>《鸡兔同笼》教学设计</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:color w:val="8B8178"/><w:sz w:val="21"/></w:rPr><w:t>四年级下册 · 数学广角 · 试听课 · 45分钟</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:rPr><w:color w:val="3B82F6"/><w:sz w:val="30"/></w:rPr><w:t>一、课题信息</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr><w:tblLook w:firstRow="1"/></w:tblPr>
      <w:tblGrid><w:gridCol w:w="1901"/><w:gridCol w:w="6739"/></w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr><w:shd w:fill="3B82F6"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>项目</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:shd w:fill="3B82F6"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>内容</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:shd w:fill="FFFCF3"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>课题</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:shd w:fill="FFFCF3"/></w:tcPr>
          <w:p><w:r><w:t>鸡兔同笼（数学广角）</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:rPr><w:color w:val="3B82F6"/><w:sz w:val="30"/></w:rPr><w:t>二、教学目标</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading4"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="3B82F6"/><w:sz w:val="19"/></w:rPr><w:t>知识目标</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="ListBullet"/></w:pPr>
      <w:r><w:t>会解决「鸡兔同笼」这类问题</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="ListBullet"/></w:pPr>
      <w:r><w:t>理解假设法的道理</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pBdr><w:left w:val="single" w:sz="24" w:color="FBBF24"/></w:pBdr>
        <w:shd w:val="clear" w:fill="FFF7E6"/>
      </w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>教学主张：</w:t></w:r>
      <w:r><w:t>本节课不要求背公式！</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:rPr><w:color w:val="3B82F6"/><w:sz w:val="30"/></w:rPr><w:t>三、教学过程</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="21"/></w:rPr><w:t>① 情境导入 5′</w:t></w:r>
      <w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="21"/></w:rPr><w:t>② 探究新知 15′</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading3"/></w:pPr>
      <w:r><w:rPr><w:color w:val="FB7185"/><w:sz w:val="25"/></w:rPr><w:t>环节一 情境导入（5 分钟）</w:t></w:r>
      <w:r><w:rPr><w:b/><w:color w:val="3B82F6"/><w:sz w:val="19"/></w:rPr><w:t> PPT P4-P5</w:t></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <a:graphic>
              <a:graphicData>
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:blipFill><a:blip r:embed="rIdImg1"/></pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p>
      <w:hyperlink r:id="rIdLink1">
        <w:r><w:t>参考资料链接</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:pBdr><w:top w:val="single" w:sz="6" w:color="F0E7D8"/></w:pBdr>
      </w:pPr>
      <w:r><w:rPr><w:color w:val="8B8178"/><w:sz w:val="18"/></w:rPr><w:t>四年级数学试听课 · 鸡兔同笼</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`,
  };
}

describe('importDocx', () => {
  it('imports a structured lesson plan .docx into document format by default with section cards, tables, lists, callouts, pills, images, links, and dividers', async () => {
    const zip = await createZip(buildLessonPlanDocxXml());
    const res = await importDocx(zip);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { doc } = res;
    expect(doc.looma).toBe(2);
    expect(doc.format).toBe('document');
    expect(doc.title).toBe('《鸡兔同笼》教学设计');
    expect(doc.theme.preset).toBe('warm');
    expect(Object.keys(doc.assets)).toHaveLength(1);

    // Card 1: Document Title + Subtitle + Section 1 (一、课题信息) + Table
    expect(doc.cards).toHaveLength(3);
    const card1 = doc.cards[0]!;
    expect(card1.body.map((n) => n.type)).toEqual(['heading', 'paragraph', 'heading', 'table']);
    expect(card1.body[0]).toMatchObject({
      type: 'heading',
      level: 1,
    });
    expect(card1.body[1]).toMatchObject({
      type: 'paragraph',
      align: 'center',
      text: '{color:muted}四年级下册 · 数学广角 · 试听课 · 45分钟{/color}',
    });
    expect(card1.body[3]).toMatchObject({
      type: 'table',
      header: true,
      rows: [
        ['**项目**', '**内容**'],
        ['**课题**', '鸡兔同笼（数学广角）'],
      ],
    });

    // Card 2: 二、教学目标 (H2 + H3 + bullet list + warning callout)
    const card2 = doc.cards[1]!;
    expect(card2.body.map((n) => n.type)).toEqual(['heading', 'heading', 'list', 'callout']);
    expect(card2.body[2]).toMatchObject({
      type: 'list',
      style: 'bullet',
      items: ['会解决「鸡兔同笼」这类问题', '理解假设法的道理'],
    });
    expect(card2.body[3]).toMatchObject({
      type: 'callout',
      tone: 'warning',
      text: '**教学主张：**本节课不要求背公式！',
    });

    // Card 3: 三、教学过程 (H2 + highlighted step pills + H3 mixed colors + image + link + divider + footer)
    const card3 = doc.cards[2]!;
    expect(card3.body.map((n) => n.type)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'image',
      'paragraph',
      'divider',
      'paragraph',
    ]);
    // White-colored runs on unshaded paragraph become visible blue pills instead of invisible white text
    expect(card3.body[1]).toMatchObject({
      type: 'paragraph',
      text: '{highlight:blue}{color:primary}**① 情境导入 5′**{/color}{/highlight}   {highlight:blue}{color:primary}**② 探究新知 15′**{/color}{/highlight}',
    });
    // Mixed-color Heading3 preserves both coral/danger and blue/primary runs
    expect(card3.body[2]).toMatchObject({
      type: 'heading',
      level: 3,
    });
    if (card3.body[2]?.type === 'heading') {
      expect(card3.body[2].text).toContain('环节一');
      expect(card3.body[2].text).toContain('PPT P4-P5');
    }

    // Roundtrip strict validation
    const reparsed = parseDocument(JSON.stringify(doc), { repair: false });
    expect(reparsed.ok).toBe(true);
  });

  it('supports importing into presentation format and splits large teaching-process sections by Heading3 so slides stay concise', async () => {
    const zip = await createZip(buildLessonPlanDocxXml());
    const res = await importDocx(zip, { format: 'presentation' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.format).toBe('presentation');
    expect(res.doc.cards.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects legacy binary .doc (OLE2) files with a clear message', async () => {
    const oleHeader = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    const res = await importDocx(oleHeader);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/\.doc/i);
    }
  });
});
