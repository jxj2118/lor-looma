import { expect, test } from '@playwright/test';

const themes = {
  clean: {
    bg: '#f6f7f9',
    fg: '#1f2328',
    card: '#ffffff',
    heading:
      '"Inter", "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  dark: {
    bg: '#0b0f17',
    fg: '#e6edf3',
    card: '#131a26',
    heading:
      '"Inter", "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  warm: {
    bg: '#f6ede1',
    fg: '#3b2f2a',
    card: '#fffaf3',
    heading:
      'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  serif: {
    bg: '#efece4',
    fg: '#1c1b19',
    card: '#fffefb',
    heading:
      '"Iowan Old Style", "Palatino Linotype", Georgia, "Noto Serif", "Songti SC", "SimSun", serif',
  },
} as const;

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const color = hex.replace('#', '');
  return 0.2126 * channel(color, 0) + 0.7152 * channel(color, 2) + 0.0722 * channel(color, 4);
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

for (const [preset, tokens] of Object.entries(themes)) {
  test(`renders the ${preset} theme`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.getByLabel('Theme').selectOption(preset);

    const root = page.locator('[data-looma-root]').first();
    await expect(root).toHaveAttribute('data-looma-theme', preset);
    const applied = await root.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        bg: style.getPropertyValue('--lm-color-bg').trim(),
        fg: style.getPropertyValue('--lm-color-fg').trim(),
        card: style.getPropertyValue('--lm-card-background').trim(),
        heading: style.getPropertyValue('--lm-font-heading').trim(),
      };
    });
    expect(applied).toEqual(tokens);
    expect(contrast(tokens.fg, tokens.card)).toBeGreaterThan(4.5);

    const card = page.locator('[data-lm-card-id]').first();
    await expect(card).toBeVisible();
    // Pixel baselines are captured on macOS Chromium. CSS variables above are the cross-platform check.
    if (process.platform === 'darwin') {
      await expect(card).toHaveScreenshot(`theme-${preset}.png`);
    }
  });
}
