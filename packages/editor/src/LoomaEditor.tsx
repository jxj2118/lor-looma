import { LoomaRoot } from '@lor-looma/viewer';

export interface LoomaEditorProps {
  className?: string;
}

export function LoomaEditor({ className }: LoomaEditorProps) {
  return (
    <LoomaRoot className={className}>
      <div data-looma-editor="">Looma editor</div>
    </LoomaRoot>
  );
}
