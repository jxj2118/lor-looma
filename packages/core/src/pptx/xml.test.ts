import { describe, expect, it } from 'vitest';
import { attr, child, children, descendants, localName, parseXml, textContent } from './xml';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!-- deck -->
<p:sld xmlns:a="urn:a" xmlns:p="urn:p" xmlns:r="urn:r">
  <p:sp name="a&amp;b">
    <p:txBody>
      <a:p>
        <a:r>
          <a:rPr b="1" i="1"/>
          <a:t>1 &lt; 2 &#10;&#x41; &amp;amp;</a:t>
        </a:r>
        <a:br/>
        <a:t> <![CDATA[a &amp; b]]> </a:t>
      </a:p>
    </p:txBody>
  </p:sp>
  <p:sp/>
</p:sld>`;

describe('parseXml', () => {
  it('parses nested tags, self-closing tags, comments, and the prolog', () => {
    const root = parseXml(SAMPLE);
    expect(root).not.toBeNull();
    if (!root) return;
    expect(localName(root.name)).toBe('sld');
    expect(children(root, 'sp')).toHaveLength(2);
    expect(child(root, 'p:sp')?.attributes.name).toBe('a&b');
    const paragraphs = descendants(root, 'p');
    expect(paragraphs).toHaveLength(1);
    const runs = children(paragraphs[0]!, 'r');
    expect(runs).toHaveLength(1);
    expect(child(runs[0]!, 'br')).toBeUndefined();
    expect(children(paragraphs[0]!, 'br')).toHaveLength(1);
    expect(children(paragraphs[0]!, 'br')[0]?.children).toEqual([]);
  });

  it('decodes entities in text but leaves CDATA untouched', () => {
    const root = parseXml(SAMPLE);
    expect(root).not.toBeNull();
    if (!root) return;
    const texts = descendants(root, 't');
    expect(texts).toHaveLength(2);
    expect(textContent(texts[0]!)).toBe('1 < 2 \nA &amp;');
    expect(textContent(texts[1]!)).toBe(' a &amp; b ');
  });

  it('reads attributes with or without a namespace prefix', () => {
    const root = parseXml(`<a:blip r:embed="rId2" name="pic"/>`);
    expect(root).not.toBeNull();
    if (!root) return;
    expect(attr(root, 'r:embed')).toBe('rId2');
    expect(attr(root, 'embed')).toBe('rId2');
    expect(attr(root, 'name')).toBe('pic');
    expect(attr(root, 'missing')).toBeUndefined();
    expect(localName('sp')).toBe('sp');
    expect(localName('p:sp')).toBe('sp');
  });

  it('decodes attribute entities and numeric character references', () => {
    const root = parseXml(`<a href="https://ex.com?a=1&amp;b=&quot;x&quot;" tip="&#39;ok&#x27;"/>`);
    expect(root).not.toBeNull();
    if (!root) return;
    expect(attr(root, 'href')).toBe('https://ex.com?a=1&b="x"');
    expect(attr(root, 'tip')).toBe("'ok'");
  });

  it('keeps significant whitespace and drops indentation between elements', () => {
    const root = parseXml('<root>\n  <a:t>  hi  </a:t>\n</root>');
    expect(root).not.toBeNull();
    if (!root) return;
    expect(root.children.filter((node) => typeof node === 'string')).toEqual([]);
    expect(textContent(child(root, 't')!)).toBe('  hi  ');
  });

  it('lists descendants in document order and does not include the element itself', () => {
    const root = parseXml(
      '<root><p:sp id="1"><p:sp id="2"/></p:sp><a:sp id="3"><a:t>x</a:t></a:sp></root>',
    );
    expect(root).not.toBeNull();
    if (!root) return;
    expect(descendants(root, 'sp').map((node) => attr(node, 'id'))).toEqual(['1', '2', '3']);
    expect(descendants(root, 'root')).toEqual([]);
    expect(children(root, 'sp').map((node) => attr(node, 'id'))).toEqual(['1', '3']);
  });

  it('skips a doctype and single-quoted attribute values', () => {
    const root = parseXml(`<!DOCTYPE root [<!ELEMENT root EMPTY>]><root id='1'/>`);
    expect(root).not.toBeNull();
    if (!root) return;
    expect(attr(root, 'id')).toBe('1');
    expect(root.children).toEqual([]);
  });

  it.each(['', '   ', 'not xml', '<a>', '<a></b>', '<a></a><b/>', '<a b=>', '<a></a></a>'])(
    'returns null for %j',
    (xml) => {
      expect(parseXml(xml)).toBeNull();
    },
  );
});
