import { LoomaRoot } from '@lor-looma/viewer';
import styles from './LoomaEditor.module.css';

export interface LoomaEditorProps {
  className?: string;
}

export function LoomaEditor({ className }: LoomaEditorProps) {
  return (
    <LoomaRoot className={className}>
      <div className={styles.root} data-looma-editor="">
        Looma editor
      </div>
    </LoomaRoot>
  );
}
