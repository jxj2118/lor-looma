export function gapCss(gap: 'none' | 'sm' | 'md' | 'lg' | undefined): string {
  switch (gap ?? 'md') {
    case 'none':
      return '0px';
    case 'sm':
      return 'calc(var(--lm-block-gap) * 0.5)';
    case 'md':
      return 'var(--lm-block-gap)';
    case 'lg':
      return 'calc(var(--lm-block-gap) * 1.75)';
  }
}
