import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import styles from './node.module.css';

interface Props {
  children?: ReactNode;
}

interface State {
  failed: boolean;
}

export class NodeErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(error, info);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={styles.fallback}>
          <p>This block could not be displayed</p>
        </div>
      );
    }
    return this.props.children;
  }
}
