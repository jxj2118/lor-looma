import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

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
    await expect(page.getByRole('button', { name: '导入 `.looma`' })).toBeVisible();

    await page.getByLabel('视图').selectOption('editor');
    await expect(locale).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI 控制台' })).toBeVisible();

    await locale.selectOption('zh-TW');
    await expect(page.getByRole('button', { name: 'AI 主控台' })).toBeVisible();
    await expect(page.getByRole('button', { name: '匯出 `.looma`' })).toBeVisible();
    await expect(page.getByRole('button', { name: '匯入 `.looma`' })).toBeVisible();

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
});
