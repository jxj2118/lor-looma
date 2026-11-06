import { createId } from '@lor-looma/core';
import type { LoomaSceneElement } from '@lor-looma/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import { useEditorContext } from '../state/viewState';
import { AssetInput, type PickedAsset } from './AssetInput';
import styles from './Inspector.module.css';

export function SceneElementInspector({
  cardId,
  element,
}: {
  cardId: string;
  element: LoomaSceneElement;
}) {
  const { store, messages } = useEditorContext();
  useLoomaDocument({ store });

  function replaceImage(asset: PickedAsset) {
    if (element.type !== 'image') return;
    const id = createId('asset');
    const image: {
      kind: 'image';
      src: string;
      alt: string;
      width?: number;
      height?: number;
    } = { kind: 'image', src: asset.src, alt: asset.alt ?? '' };
    if (asset.width !== undefined) image.width = asset.width;
    if (asset.height !== undefined) image.height = asset.height;

    store.apply(
      [
        { op: 'putAsset', id, asset: image },
        {
          op: 'updateSceneElement',
          cardId,
          elementId: element.id,
          patch: { assetId: id, ...(asset.alt !== undefined ? { alt: asset.alt } : {}) },
        },
      ],
      { origin: 'user', label: 'Replace image' },
    );
  }

  return (
    <div className={styles.body} data-lm-scene-inspector={element.id}>
      <p className={styles.kind}>
        {element.type === 'image' ? messages.image : messages.paragraph}
      </p>
      {element.type === 'image' ? <AssetInput onPick={replaceImage} /> : null}
    </div>
  );
}
