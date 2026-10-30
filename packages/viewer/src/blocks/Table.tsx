import type { TableBlock } from '@lor-looma/core';
import { TextSlot, slotKey } from '../nodes/TextSlot';
import styles from './blocks.module.css';

export function Table({ block }: { block: TableBlock }) {
  const rows = block.header ? block.rows.slice(1) : block.rows;
  const header = block.header ? block.rows[0] : undefined;
  const bodyOffset = block.header ? 1 : 0;
  return (
    <div className={`${styles.block} ${styles.tableScroll}`}>
      <table className={styles.table}>
        {header ? (
          <thead>
            <tr>
              {header.map((cell, index) => (
                <th key={index} scope="col">
                  <TextSlot
                    nodeId={block.id}
                    slot={slotKey({ kind: 'cell', row: 0, col: index })}
                    text={cell}
                  />
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
                  <TextSlot
                    nodeId={block.id}
                    slot={slotKey({ kind: 'cell', row: rowIndex + bodyOffset, col: cellIndex })}
                    text={cell}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
