import type { TableBlock } from '@lor-looma/core';
import { InlineText } from '../inline/InlineText';
import styles from './blocks.module.css';

export function Table({ block }: { block: TableBlock }) {
  const rows = block.header ? block.rows.slice(1) : block.rows;
  const header = block.header ? block.rows[0] : undefined;
  return (
    <div className={`${styles.block} ${styles.tableScroll}`}>
      <table className={styles.table}>
        {header ? (
          <thead>
            <tr>
              {header.map((cell, index) => (
                <th key={index} scope="col">
                  <InlineText text={cell} />
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>
                  <InlineText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
