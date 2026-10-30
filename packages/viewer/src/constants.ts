export const LOGICAL_SIZE = {
  presentation: { width: 1280, height: 720 },
  document: { width: 816 },
} as const;

/** Logical-pixel type and spacing baselines. Cards inject these as `--lm-size-*`. */
export const TYPE_SCALE = {
  presentation: {
    h1: 60,
    h2: 44,
    h3: 32,
    body: 26,
    small: 20,
    lineHeightBody: 1.45,
    lineHeightHeading: 1.15,
    blockGap: 24,
    paddingX: 72,
    paddingY: 60,
  },
  document: {
    h1: 36,
    h2: 28,
    h3: 22,
    body: 17,
    small: 14,
    lineHeightBody: 1.6,
    lineHeightHeading: 1.25,
    blockGap: 16,
    paddingX: 72,
    paddingY: 64,
  },
} as const;
