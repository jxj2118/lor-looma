import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createZip } from '../../../packages/core/src/pptx/zip';

const imported = {
  looma: 1,
  id: 'doc_imported',
  title: 'Imported deck',
  format: 'presentation',
  theme: { preset: 'clean' },
  cards: [
    {
      id: 'c_imported',
      body: [{ id: 'b_imported', type: 'paragraph', text: 'Imported paragraph' }],
    },
  ],
};

test.describe('playground', () => {
  test('edits a new card, changes a block property, then undoes and redoes', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('View').selectOption('editor');
    const sidebar = page.getByRole('complementary', { name: 'Cards' });
    await sidebar.getByRole('button', { name: 'Add card' }).click();
    const canvas = page.locator('[data-lm-editor-canvas]');
    const editor = canvas.locator('[contenteditable="true"]');
    // The editor lives in a scaled 1280px frame, so its layout box sits outside the viewport.
    await editor.evaluate((element: HTMLElement) => element.focus());
    await page.keyboard.type('Phase eight');
    await page.keyboard.press('Escape');
    await expect(canvas.getByText('Phase eight')).toBeVisible();

    await page.getByLabel('Heading level').selectOption('1');
    await expect(page.getByLabel('Heading level')).toHaveValue('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByLabel('Heading level')).toHaveValue('2');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByLabel('Heading level')).toHaveValue('1');
    await expect(canvas.getByText('Phase eight')).toBeVisible();
  });

  test('reorders cards and walks the play overlay', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('View').selectOption('editor');
    const sidebar = page.getByRole('complementary', { name: 'Cards' });
    const cards = sidebar.locator('[data-lm-sidebar-card]');
    const firstId = await cards.first().getAttribute('data-lm-sidebar-card');
    await sidebar.locator('li').first().getByRole('button', { name: 'Move down' }).click();
    await expect(cards.first()).not.toHaveAttribute('data-lm-sidebar-card', firstId ?? '');

    await page.getByRole('button', { name: 'Play' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[data-lm-present]')).toBeVisible();
    await dialog.locator('[data-looma-root]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText(/^2 \/ \d+$/)).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.getByText(/^1 \/ \d+$/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('executes AI commands and imports an exported document', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('View').selectOption('editor');
    await page.getByRole('button', { name: 'AI Console' }).click();
    await expect(page.getByTestId('ai-panel')).toBeVisible();

    await page.getByLabel('Command JSON').fill(
      JSON.stringify(
        {
          op: 'insertNode',
          node: { type: 'paragraph', text: 'Added by the console.' },
          at: { parent: 'c_title' },
        },
        null,
        2,
      ),
    );
    await page.getByRole('button', { name: 'Apply as AI' }).click();
    await expect(page.getByTestId('ai-result')).toContainText('"ok": true');
    await expect(page.getByTestId('ai-result')).toContainText('createdIds');
    await expect(page.getByTestId('ai-result')).toContainText('touchedIds');
    await expect(page.getByText('Added by the console.').first()).toBeVisible();

    await page.getByLabel('Command JSON').fill('{ "op": "nope" }');
    await page.getByRole('button', { name: 'Apply as AI' }).click();
    const result = page.getByTestId('ai-result');
    await expect(result).toContainText('"ok": false');
    await expect(result).toContainText('commandIndex');
    await expect(result).toContainText('path');
    await expect(result).toContainText('message');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export `.looma`' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('introduction-to-photosynthesis.looma.json');
    const raw = readFileSync(await download.path(), 'utf8');
    expect(raw).toContain('"looma": 1');
    expect(raw).toContain('Added by the console.');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'imported.looma.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported)),
    });
    await expect(page.getByTestId('playground-status')).toContainText('Loaded the document.');
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Imported deck');
    await expect(page.getByText('Imported paragraph').first()).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'broken.looma.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{'),
    });
    await expect(page.getByTestId('playground-status')).toContainText('not valid JSON');
  });

  test('switches between en-US, zh-CN, and zh-TW', async ({ page }) => {
    await page.goto('/');
    const locale = page.getByTestId('locale-select');
    await expect(locale).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI Console' })).toBeVisible();

    await locale.selectOption('zh-CN');
    await expect(page.getByRole('button', { name: 'AI 控制台' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导出 `.looma`' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导入 `.looma` / `.pptx`' })).toBeVisible();

    await page.getByLabel('视图').selectOption('editor');
    await expect(locale).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI 控制台' })).toBeVisible();

    await locale.selectOption('zh-TW');
    await expect(page.getByRole('button', { name: 'AI 主控台' })).toBeVisible();
    await expect(page.getByRole('button', { name: '匯出 `.looma`' })).toBeVisible();
    await expect(page.getByRole('button', { name: '匯入 `.looma` / `.pptx`' })).toBeVisible();

    await locale.selectOption('en-US');
    await expect(page.getByRole('button', { name: 'AI Console' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export `.looma`' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print / PDF' })).toBeVisible();
    await expect(locale).toBeVisible();
  });

  test('splits a card and edits the table around the clicked cell', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('View').selectOption('editor');
    const sidebar = page.getByRole('complementary', { name: 'Cards' });
    const before = await sidebar.locator('[data-lm-sidebar-card]').count();
    const lead = page.locator('[data-lm-editor-node="b_lead"]');
    await lead.getByRole('button', { name: 'Drag to move' }).click({ force: true });
    await page.getByRole('menuitem', { name: 'Split card here' }).click();
    await expect(sidebar.locator('[data-lm-sidebar-card]')).toHaveCount(before + 1);

    const table = page.locator('[data-lm-editor-node="b_stages"] table');
    await expect(table.locator('tr')).toHaveCount(3);
    await table.getByText('Calvin cycle').click({ force: true });
    await expect(page.getByText('Row 3, Column 1')).toBeVisible();
    await page.getByRole('button', { name: 'Insert row above' }).click();
    await page.getByRole('button', { name: 'Insert column left' }).click();
    await expect(table.locator('tr')).toHaveCount(4);
    await expect(table.locator('tr').first().locator('th')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Delete row' })).toBeEnabled();

    const code = page.locator('[data-lm-editor-node="b_equation"]');
    await expect(code.locator('[data-lm-token="plain"]')).toHaveCount(1);
    await expect(code.getByRole('button', { name: 'Copy code' })).toBeVisible();
  });

  test('inserts steps, a stat, and math, then sets an image focal point', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('View').selectOption('editor');
    await page.getByRole('button', { name: 'AI Console' }).click();
    await page.getByRole('button', { name: 'Insert steps, a metric, and a formula' }).click();
    await page.getByRole('button', { name: 'Apply as AI' }).click();
    await expect(page.getByTestId('ai-result')).toContainText('"ok": true');
    await page.getByTestId('ai-panel').getByRole('button', { name: 'Close' }).click();

    const canvas = page.locator('[data-lm-editor-canvas]');
    await expect(canvas.locator('[data-lm-steps="vertical"]')).toBeVisible();
    await expect(canvas.locator('[data-lm-step="1"]')).toContainText('1');
    await expect(canvas.locator('[data-lm-step="2"]')).toContainText('Build sugar');
    await expect(canvas.locator('[data-lm-slot="stat:value"]')).toContainText('98%');
    await expect(canvas.locator('[data-lm-slot="stat:label"]')).toContainText('Completion rate');
    await expect(canvas.locator('[data-lm-math="frac"] [data-lm-math="num"]')).toContainText('6CO');
    await expect(canvas.locator('[data-lm-math="frac"] [data-lm-math="den"]')).toContainText('6H');

    const sidebar = page.getByRole('complementary', { name: 'Cards' });
    await sidebar.locator('[data-lm-sidebar-card]').nth(1).click();
    await page.locator('[data-lm-editor-node="b_leaf"]').click({ force: true });
    const image = page.locator('[data-lm-editor-node="b_leaf"] img');
    await page.getByLabel('Horizontal X (%)').fill('30');
    await expect(image).toHaveAttribute('data-focal', '30,50');
    await page.getByLabel('Vertical Y (%)').fill('70');
    await expect(image).toHaveAttribute('data-focal', '30,70');
    await page.getByRole('button', { name: 'Center focal point' }).click();
    await expect(page.locator('[data-lm-editor-node="b_leaf"] img')).not.toHaveAttribute(
      'data-focal',
    );
  });

  test('imports a pptx file onto the canvas and into the editor', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'quarterly-review.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: Buffer.from(await samplePptx()),
    });
    await expect(page.getByTestId('playground-status')).toContainText(
      'Imported the PowerPoint file.',
    );
    const viewer = page.locator('[data-looma-root]');
    await expect(viewer.getByText('Imported from PowerPoint').first()).toBeVisible();
    await expect(viewer.getByText('First point').first()).toBeVisible();
    await expect(viewer.getByText('Topic').first()).toBeVisible();

    await page.getByLabel('View').selectOption('editor');
    const canvas = page.locator('[data-lm-editor-canvas]');
    await expect(canvas.getByText('Imported from PowerPoint').first()).toBeVisible();
    await expect(canvas.getByText('Second point').first()).toBeVisible();
    await expect(canvas.getByText('Ready').first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(
      'Imported from PowerPoint',
    );
    const notes = page.getByRole('textbox', { name: 'Speaker notes' });
    await expect(notes).toHaveValue('Speak slowly');
    await notes.fill('Speak slowly, then pause');
    await notes.blur();
    await expect(notes).toHaveValue('Speak slowly, then pause');
  });
});

const SLIDE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const NOTES_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';

function packageRels(items: { id: string; type: string; target: string }[]): string {
  const body = items
    .map((item) => `<Relationship Id="${item.id}" Type="${item.type}" Target="${item.target}"/>`)
    .join('');
  return `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

async function samplePptx(): Promise<Uint8Array> {
  const cx = 12_192_000;
  const cy = 6_858_000;
  const slide = `<?xml version="1.0"?>
<p:sld xmlns:a="urn:a" xmlns:p="urn:p" xmlns:r="urn:r"><p:cSld><p:spTree>
  <p:nvGrpSpPr/>
  <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/><a:chOff x="0" y="0"/><a:chExt cx="${cx}" cy="${cy}"/></a:xfrm></p:grpSpPr>
  <p:sp>
    <p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="11000000" cy="800000"/></a:xfrm></p:spPr>
    <p:txBody><a:p><a:r><a:t>Imported from PowerPoint</a:t></a:r></a:p></p:txBody>
  </p:sp>
  <p:sp>
    <p:nvSpPr><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="0" y="1000000"/><a:ext cx="11000000" cy="1200000"/></a:xfrm></p:spPr>
    <p:txBody>
      <a:p><a:pPr lvl="0"><a:buChar char="•"/></a:pPr><a:r><a:t>First point</a:t></a:r></a:p>
      <a:p><a:pPr lvl="0"><a:buChar char="•"/></a:pPr><a:r><a:t>Second point</a:t></a:r></a:p>
    </p:txBody>
  </p:sp>
  <p:graphicFrame>
    <p:xfrm><a:off x="0" y="2500000"/><a:ext cx="11000000" cy="1500000"/></p:xfrm>
    <a:graphic><a:graphicData><a:tbl><a:tblPr firstRow="1"/>
      <a:tr>
        <a:tc><a:txBody><a:p><a:r><a:t>Topic</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:t>Status</a:t></a:r></a:p></a:txBody></a:tc>
      </a:tr>
      <a:tr>
        <a:tc><a:txBody><a:p><a:r><a:t>Import</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:t>Ready</a:t></a:r></a:p></a:txBody></a:tc>
      </a:tr>
    </a:tbl></a:graphicData></a:graphic>
  </p:graphicFrame>
</p:spTree></p:cSld></p:sld>`;
  const notes = `<?xml version="1.0"?>
<p:notes xmlns:a="urn:a" xmlns:p="urn:p"><p:cSld><p:spTree>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
    <p:txBody><a:p><a:r><a:t>Speak slowly</a:t></a:r></a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr>
    <p:txBody><a:p><a:r><a:t>1</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:notes>`;
  return createZip({
    'docProps/core.xml':
      '<?xml version="1.0"?><cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Imported from PowerPoint</dc:title></cp:coreProperties>',
    'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': packageRels([
      { id: 'rId1', type: SLIDE_REL, target: 'slides/slide1.xml' },
    ]),
    'ppt/slides/slide1.xml': slide,
    'ppt/slides/_rels/slide1.xml.rels': packageRels([
      { id: 'rIdNotes', type: NOTES_REL, target: '../notesSlides/notesSlide1.xml' },
    ]),
    'ppt/notesSlides/notesSlide1.xml': notes,
  });
}
