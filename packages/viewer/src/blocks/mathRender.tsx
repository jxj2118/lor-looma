import type { ReactNode } from 'react';
import styles from './blocks.module.css';

const GREEK: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

const SYMBOLS: Record<string, string> = {
  sum: '∑',
  prod: '∏',
  int: '∫',
  lim: 'lim',
  infty: '∞',
  pm: '±',
  times: '×',
  div: '÷',
  cdot: '⋅',
  leq: '≤',
  geq: '≥',
  neq: '≠',
  approx: '≈',
  equiv: '≡',
  to: '→',
  rightarrow: '→',
  Rightarrow: '⇒',
  leftrightarrow: '↔',
  in: '∈',
  subset: '⊂',
  cup: '∪',
  cap: '∩',
  forall: '∀',
  exists: '∃',
  nabla: '∇',
  partial: '∂',
};

const LARGE = new Set(['sum', 'prod', 'int', 'lim']);

/** Render a LaTeX math subset. Unknown macros and unmatched braces become text. */
export function renderMathTex(tex: string): ReactNode {
  if (tex.trim() === '') return null;
  const parser = new MathParser(tex);
  const rows = parser.parseRows();
  if (rows.length === 1) return rows[0] ?? null;
  return rows;
}

class MathParser {
  private index = 0;
  private key = 0;

  constructor(private readonly source: string) {}

  parseRows(): ReactNode[] {
    const rows: ReactNode[] = [];
    for (;;) {
      rows.push(this.el('row', styles.mathRow, this.parseItems(false, false)));
      this.skipSpace();
      if (!this.atLineBreak()) break;
      this.index += 2;
    }
    return rows;
  }

  private parseItems(stopOnClose: boolean, stopOnRight: boolean): ReactNode[] {
    const items: ReactNode[] = [];
    while (this.index < this.source.length) {
      const before = this.index;
      this.skipSpace();
      if (this.index >= this.source.length || this.atLineBreak()) break;
      if (this.source[this.index] === '}') {
        if (stopOnClose) break;
        this.index += 1;
        items.push('}');
        continue;
      }
      if (stopOnRight && this.peekCommand() === 'right') break;
      const item = this.parseScripted();
      if (item !== null) items.push(item);
      if (this.index === before) {
        items.push(this.source[this.index] ?? '');
        this.index += 1;
      }
    }
    return items;
  }

  private parseScripted(): ReactNode | null {
    this.skipSpace();
    if (this.index >= this.source.length || this.atLineBreak()) return null;
    if (this.source[this.index] === '}') return null;

    let base: ReactNode;
    if (this.source[this.index] === '^' || this.source[this.index] === '_') base = '';
    else {
      const atom = this.parseAtom();
      if (atom === null) return null;
      base = atom;
    }

    let sub: ReactNode | null = null;
    let sup: ReactNode | null = null;
    for (;;) {
      this.skipSpace();
      const mark = this.source[this.index];
      if (mark !== '^' && mark !== '_') break;
      this.index += 1;
      const arg = this.parseScriptArg();
      if (mark === '^') sup = sup === null ? arg : this.el('group', undefined, [sup, arg]);
      else sub = sub === null ? arg : this.el('group', undefined, [sub, arg]);
    }

    if (sub !== null && sup !== null) {
      return this.el('subsup', styles.mathSubsup, [
        this.el('base', undefined, base),
        this.el('scripts', styles.mathScriptCol, [
          this.el('sup', styles.mathScript, sup),
          this.el('sub', styles.mathScript, sub),
        ]),
      ]);
    }
    if (sup !== null) {
      return this.el('sup', styles.mathSup, [
        this.el('base', undefined, base),
        this.el('script', styles.mathScript, sup),
      ]);
    }
    if (sub !== null) {
      return this.el('sub', styles.mathSub, [
        this.el('base', undefined, base),
        this.el('script', styles.mathScript, sub),
      ]);
    }
    return base;
  }

  private parseScriptArg(): ReactNode {
    this.skipSpace();
    if (this.source[this.index] === '{') return this.parseGroup();
    if (this.source[this.index] === '\\') return this.parseAtom() ?? '';
    const ch = this.source[this.index];
    if (!ch || ch === '}' || this.atLineBreak()) return '';
    this.index += 1;
    return ch;
  }

  private parseAtom(): ReactNode | null {
    this.skipSpace();
    const ch = this.source[this.index];
    if (ch === undefined || ch === '}' || ch === '^' || ch === '_' || this.atLineBreak())
      return null;
    if (this.peekCommand() === 'right') return null;
    if (ch === '{') return this.parseGroup();
    if (ch === '\\') return this.parseMacro();
    this.index += 1;
    return ch;
  }

  private parseGroup(): ReactNode {
    this.index += 1;
    const items = this.parseItems(true, false);
    if (this.source[this.index] === '}') this.index += 1;
    return this.el('group', undefined, items);
  }

  private parseMacro(): ReactNode {
    this.index += 1;
    const ch = this.source[this.index];
    if (ch === undefined) return '\\';
    if (!/[A-Za-z]/.test(ch)) {
      this.index += 1;
      if (ch === '{' || ch === '}') return ch;
      if (ch === ',' || ch === ';' || ch === ':' || ch === ' ') return '\u2009';
      return `\\${ch}`;
    }
    const start = this.index;
    while (this.index < this.source.length && /[A-Za-z]/.test(this.source[this.index] ?? '')) {
      this.index += 1;
    }
    return this.macro(this.source.slice(start, this.index));
  }

  private macro(name: string): ReactNode {
    if (name === 'left') return this.parseLeft();
    if (name === 'right') return this.el('unknown', undefined, '\\right');
    if (name === 'frac') {
      const numerator = this.parseArg();
      const denominator = this.parseArg();
      return this.el('frac', styles.mathFrac, [
        this.el('num', styles.mathNum, numerator),
        this.el('bar', styles.mathBar, ''),
        this.el('den', styles.mathDen, denominator),
      ]);
    }
    if (name === 'sqrt') return this.parseSqrt();
    if (name === 'text' || name === 'mathrm' || name === 'mathbf') {
      const text = this.parseLiteralGroup();
      const className =
        name === 'text' ? styles.mathText : name === 'mathrm' ? styles.mathRm : styles.mathBf;
      return this.el(name === 'text' ? 'text' : name, className, text);
    }
    const glyph = GREEK[name] ?? SYMBOLS[name];
    if (glyph !== undefined) {
      if (LARGE.has(name)) return this.el('op', styles.mathOp, glyph);
      return glyph;
    }
    return this.el('unknown', undefined, `\\${name}`);
  }

  private parseArg(): ReactNode {
    this.skipSpace();
    if (this.source[this.index] === '{') return this.parseGroup();
    return this.parseAtom() ?? '';
  }

  private parseSqrt(): ReactNode {
    this.skipSpace();
    let index: ReactNode | null = null;
    if (this.source[this.index] === '[') {
      this.index += 1;
      const start = this.index;
      let depth = 1;
      while (this.index < this.source.length && depth > 0) {
        const ch = this.source[this.index];
        if (ch === '[') depth += 1;
        if (ch === ']') {
          depth -= 1;
          if (depth === 0) break;
        }
        this.index += 1;
      }
      const inner = this.source.slice(start, this.index);
      if (this.source[this.index] === ']') this.index += 1;
      index = new MathParser(inner).parseItems(false, false);
    }
    const body = this.parseArg();
    const parts: ReactNode[] = [];
    if (index !== null) parts.push(this.el('index', styles.mathRootIndex, index));
    parts.push(this.el('radical', styles.mathRadical, '√'));
    parts.push(this.el('radicand', styles.mathRootBody, body));
    return this.el('sqrt', styles.mathSqrt, parts);
  }

  private parseLeft(): ReactNode {
    const open = this.parseFence();
    const body = this.parseItems(false, true);
    let close = '';
    if (this.peekCommand() === 'right') {
      this.index += 1 + 'right'.length;
      close = this.parseFence();
    }
    return this.el('delim', styles.mathDelim, [
      this.el('open', styles.mathFence, open),
      ...body,
      this.el('close', styles.mathFence, close),
    ]);
  }

  private parseFence(): string {
    this.skipSpace();
    const ch = this.source[this.index];
    if (ch === undefined) return '';
    if (ch !== '\\') {
      this.index += 1;
      return ch === '.' ? '' : ch;
    }
    this.index += 1;
    const next = this.source[this.index];
    if (next === undefined) return '';
    if (!/[A-Za-z]/.test(next)) {
      this.index += 1;
      if (next === '{') return '{';
      if (next === '}') return '}';
      if (next === '|') return '‖';
      return next;
    }
    const start = this.index;
    while (this.index < this.source.length && /[A-Za-z]/.test(this.source[this.index] ?? '')) {
      this.index += 1;
    }
    const name = this.source.slice(start, this.index);
    if (name === 'lbrace') return '{';
    if (name === 'rbrace') return '}';
    if (name === 'langle') return '⟨';
    if (name === 'rangle') return '⟩';
    if (name === 'vert' || name === 'lvert' || name === 'rvert') return '|';
    if (name === 'Vert') return '‖';
    return name;
  }

  private parseLiteralGroup(): string {
    this.skipSpace();
    if (this.source[this.index] !== '{') {
      const ch = this.source[this.index];
      if (!ch) return '';
      this.index += 1;
      return ch;
    }
    this.index += 1;
    let out = '';
    let depth = 1;
    while (this.index < this.source.length && depth > 0) {
      const ch = this.source[this.index] ?? '';
      if (ch === '\\') {
        const next = this.source[this.index + 1];
        if (next === '{' || next === '}' || next === '\\') {
          out += next;
          this.index += 2;
          continue;
        }
      }
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          this.index += 1;
          break;
        }
      }
      out += ch;
      this.index += 1;
    }
    return out;
  }

  private peekCommand(): string | null {
    if (this.source[this.index] !== '\\' || this.atLineBreak()) return null;
    const next = this.source[this.index + 1];
    if (!next) return '';
    if (!/[A-Za-z]/.test(next)) return next;
    let end = this.index + 1;
    while (end < this.source.length && /[A-Za-z]/.test(this.source[end] ?? '')) end += 1;
    return this.source.slice(this.index + 1, end);
  }

  private atLineBreak(): boolean {
    return this.source[this.index] === '\\' && this.source[this.index + 1] === '\\';
  }

  private skipSpace(): void {
    while (this.index < this.source.length && /[ \t\r\n]/.test(this.source[this.index] ?? '')) {
      this.index += 1;
    }
  }

  private el(kind: string, className: string | undefined, children: ReactNode): ReactNode {
    this.key += 1;
    return (
      <span key={this.key} data-lm-math={kind} className={className}>
        {children}
      </span>
    );
  }
}
