import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderMathTex } from './mathRender';

function math(tex: string): HTMLElement {
  const { container } = render(<div>{renderMathTex(tex)}</div>);
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('missing math root');
  return root;
}

describe('renderMathTex', () => {
  it('renders an empty formula as nothing', () => {
    expect(renderMathTex('')).toBeNull();
    expect(renderMathTex('   ')).toBeNull();
  });

  it('builds a fraction with a bar between the numerator and denominator', () => {
    const root = math('\\frac{a+1}{b_i}');
    const frac = root.querySelector('[data-lm-math="frac"]');
    expect(frac?.querySelector('[data-lm-math="num"]')?.textContent).toBe('a+1');
    expect(frac?.querySelector('[data-lm-math="bar"]')).not.toBeNull();
    expect(frac?.querySelector('[data-lm-math="den"] [data-lm-math="sub"]')?.textContent).toContain(
      'i',
    );
  });

  it('renders square roots with and without an index', () => {
    const plain = math('\\sqrt{x+1}');
    expect(plain.querySelector('[data-lm-math="radical"]')?.textContent).toBe('√');
    expect(plain.querySelector('[data-lm-math="radicand"]')?.textContent).toBe('x+1');
    expect(plain.querySelector('[data-lm-math="index"]')).toBeNull();

    const indexed = math('\\sqrt[n+1]{x}');
    expect(indexed.querySelector('[data-lm-math="index"]')?.textContent).toBe('n+1');
    expect(indexed.querySelector('[data-lm-math="radicand"]')?.textContent).toBe('x');
  });

  it('combines a superscript and a subscript on the same base', () => {
    const root = math('x_i^{2}');
    const both = root.querySelector('[data-lm-math="subsup"]');
    expect(both?.querySelector('[data-lm-math="base"]')?.textContent).toBe('x');
    expect(both?.querySelector('[data-lm-math="sup"]')?.textContent).toBe('2');
    expect(both?.querySelector('[data-lm-math="sub"]')?.textContent).toBe('i');

    const macro = math('e^\\alpha');
    expect(macro.querySelector('[data-lm-math="sup"]')?.textContent).toContain('α');
  });

  it('maps Greek letters, operators, and relation symbols', () => {
    const root = math(
      '\\alpha \\Omega \\sum \\prod \\int \\lim \\infty \\pm \\times \\div \\cdot \\leq \\geq \\neq \\approx \\equiv \\to \\rightarrow \\Rightarrow \\leftrightarrow \\in \\subset \\cup \\cap \\forall \\exists \\nabla \\partial',
    );
    const text = root.textContent ?? '';
    for (const glyph of [
      'α',
      'Ω',
      '∑',
      '∏',
      '∫',
      'lim',
      '∞',
      '±',
      '×',
      '÷',
      '⋅',
      '≤',
      '≥',
      '≠',
      '≈',
      '≡',
      '→',
      '⇒',
      '↔',
      '∈',
      '⊂',
      '∪',
      '∩',
      '∀',
      '∃',
      '∇',
      '∂',
    ]) {
      expect(text).toContain(glyph);
    }
    expect(root.querySelectorAll('[data-lm-math="op"]')).toHaveLength(4);
  });

  it('keeps text macros literal and styles them apart from math', () => {
    const root = math('\\text{a^2} + \\mathrm{H} + \\mathbf{v}');
    expect(root.querySelector('[data-lm-math="text"]')?.textContent).toBe('a^2');
    expect(root.querySelector('[data-lm-math="text"] [data-lm-math="sup"]')).toBeNull();
    expect(root.querySelector('[data-lm-math="mathrm"]')?.textContent).toBe('H');
    expect(root.querySelector('[data-lm-math="mathbf"]')?.textContent).toBe('v');
  });

  it('wraps a subformula in left and right delimiters', () => {
    const root = math('\\left( \\frac{1}{2} \\right)');
    const delim = root.querySelector('[data-lm-math="delim"]');
    expect(delim?.querySelector('[data-lm-math="open"]')?.textContent).toBe('(');
    expect(delim?.querySelector('[data-lm-math="close"]')?.textContent).toBe(')');
    expect(delim?.querySelector('[data-lm-math="frac"]')).not.toBeNull();
  });

  it('splits rows on a line break', () => {
    const root = math('a \\\\ b');
    const rows = root.querySelectorAll('[data-lm-math="row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toBe('a');
    expect(rows[1]?.textContent).toBe('b');
  });

  it('falls back to source text for unknown macros and unmatched braces', () => {
    const samples = [
      '\\notamacro',
      '{',
      '}',
      '\\',
      '\\frac',
      '\\frac{1}',
      '\\sqrt[',
      '\\left(',
      'a^',
      '_',
      'x^{',
    ];
    for (const sample of samples) {
      expect(() => math(sample)).not.toThrow();
    }
    expect(math('\\notamacro').textContent).toContain('\\notamacro');
    expect(math('a}b').textContent).toBe('a}b');
    expect(math('{a').textContent).toBe('a');
  });
});
