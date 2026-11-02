import { useEditorContext } from '../state/viewState';
import styles from './Inspector.module.css';

export function FocalPointFields({
  focal,
  onChange,
}: {
  focal: { x: number; y: number } | undefined;
  onChange: (next: { x: number; y: number } | null) => void;
}) {
  const { messages } = useEditorContext();
  const x = focal?.x ?? 50;
  const y = focal?.y ?? 50;

  function write(axis: 'x' | 'y', raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const clamped = Math.min(100, Math.max(0, value));
    onChange({
      x: axis === 'x' ? clamped : x,
      y: axis === 'y' ? clamped : y,
    });
  }

  return (
    <>
      <p className={styles.kind}>{messages.focalPoint}</p>
      <label className={styles.field}>
        {messages.focalX}
        <input
          aria-label={messages.focalX}
          type="number"
          min={0}
          max={100}
          value={x}
          onChange={(event) => write('x', event.target.value)}
        />
      </label>
      <label className={styles.field}>
        {messages.focalY}
        <input
          aria-label={messages.focalY}
          type="number"
          min={0}
          max={100}
          value={y}
          onChange={(event) => write('y', event.target.value)}
        />
      </label>
      <button type="button" onClick={() => onChange(null)}>
        {messages.resetFocalPoint}
      </button>
    </>
  );
}
