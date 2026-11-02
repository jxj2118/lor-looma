import type { CodeBlock } from '@lor-looma/core';
import { useEffect, useState } from 'react';
import { useRenderSlot } from '../nodes/context';
import { slotKey } from '../nodes/TextSlot';
import { tokenizeCode } from './highlight';
import styles from './blocks.module.css';

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={styles.copyCode}
      aria-label="Copy code"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(code);
        setCopied(true);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function Code({ block }: { block: CodeBlock }) {
  const renderSlot = useRenderSlot();
  const key = slotKey({ kind: 'code' });
  const renderDefault = () =>
    tokenizeCode(block.code, block.language).map((token, index) => (
      <span key={index} data-lm-token={token.kind}>
        {token.value}
      </span>
    ));

  return (
    <pre className={`${styles.block} ${styles.code}`} data-language={block.language}>
      <div className={styles.codeBar}>
        {block.language ? <span className={styles.codeLang}>{block.language}</span> : <span />}
        <CopyCodeButton code={block.code} />
      </div>
      <code data-lm-slot={key}>
        {renderSlot ? renderSlot(block.id, key, renderDefault) : renderDefault()}
      </code>
    </pre>
  );
}
