export const LOOMA_TOOL_NAMES = ['looma_get_outline', 'looma_get_cards', 'looma_apply'] as const;

export type LoomaToolName = (typeof LOOMA_TOOL_NAMES)[number];
