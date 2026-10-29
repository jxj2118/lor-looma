import { LOOMA_SCHEMA_VERSION } from '@lor-looma/core';
import { LoomaEditor } from '@lor-looma/editor';

export function App() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontFamily: 'system-ui', fontSize: 20 }}>
        Looma Playground · schema v{LOOMA_SCHEMA_VERSION}
      </h1>
      <LoomaEditor />
    </main>
  );
}
