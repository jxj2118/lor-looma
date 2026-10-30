type FontStack = 'system' | 'sans' | 'serif' | 'rounded' | 'mono';

/** CSS `font-family` values for each core font-stack name. Hosts load webfonts if they want them. */
export const FONT_FAMILY: Record<FontStack, string> = {
  system:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
  sans: '"Inter", "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  serif:
    '"Iowan Old Style", "Palatino Linotype", Georgia, "Noto Serif", "Songti SC", "SimSun", serif',
  rounded:
    'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", "Noto Sans Mono", monospace',
};
