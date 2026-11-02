import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useEditorContext } from '../state/viewState';
import styles from './Inspector.module.css';

export interface PickedAsset {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

function isImageUrl(value: string): boolean {
  return (
    value.startsWith('https://') || value.startsWith('http://') || value.startsWith('data:image/')
  );
}

export function AssetInput({ onPick }: { onPick: (asset: PickedAsset) => void }) {
  const { messages, uploadAsset } = useEditorContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isImageUrl(url)) {
      setError(messages.imageUrlInvalid);
      return;
    }
    setError('');
    onPick({ src: url, alt: url });
    setUrl('');
  }

  return (
    <div className={styles.asset}>
      <form onSubmit={submit}>
        <label className={styles.field}>
          {messages.imageUrl}
          <input
            aria-label={messages.imageUrl}
            value={url}
            placeholder={messages.imageUrlPlaceholder}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <button type="submit">{messages.replaceImage}</button>
      </form>
      {uploadAsset ? (
        <>
          <button type="button" onClick={() => fileRef.current?.click()}>
            {messages.uploadImage}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              const upload = uploadAsset;
              event.target.value = '';
              if (!file || !upload) return;
              void upload(file)
                .then((uploaded) => {
                  setError('');
                  onPick({
                    src: uploaded.src,
                    alt: uploaded.alt ?? file.name,
                    width: uploaded.width,
                    height: uploaded.height,
                  });
                })
                .catch(() => setError(messages.imageUploadFailed));
            }}
          />
        </>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
