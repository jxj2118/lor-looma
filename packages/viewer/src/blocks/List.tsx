import type { ListBlock, ListItem } from '@lor-looma/core';
import { InlineText } from '../inline/InlineText';
import styles from './blocks.module.css';

function itemFields(item: ListItem): { text: string; checked?: boolean; children?: ListItem[] } {
  if (typeof item === 'string') return { text: item };
  return { text: item.text, checked: item.checked, children: item.children };
}

function ListBody({
  items,
  style,
  nested,
}: {
  items: ListItem[];
  style: ListBlock['style'];
  nested?: boolean;
}) {
  const Tag = style === 'number' ? 'ol' : 'ul';
  const className = nested ? styles.list : `${styles.block} ${styles.list}`;
  return (
    <Tag className={className} data-style={style === 'check' ? 'check' : undefined}>
      {items.map((item, index) => {
        const fields = itemFields(item);
        return (
          <li key={index} aria-checked={style === 'check' ? Boolean(fields.checked) : undefined}>
            <div className={styles.itemRow}>
              {style === 'check' ? (
                <span className={styles.mark} aria-hidden="true">
                  {fields.checked ? '☑' : '☐'}
                </span>
              ) : null}
              <InlineText text={fields.text} />
            </div>
            {fields.children && fields.children.length > 0 ? (
              <ListBody items={fields.children} style={style} nested />
            ) : null}
          </li>
        );
      })}
    </Tag>
  );
}

export function List({ block }: { block: ListBlock }) {
  return <ListBody items={block.items} style={block.style} />;
}
