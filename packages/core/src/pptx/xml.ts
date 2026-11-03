export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlChild[];
}

export type XmlChild = XmlElement | string;

/** Tag or attribute name with its namespace prefix removed. `p:sp` becomes `sp`. */
export function localName(name: string): string {
  const index = name.indexOf(':');
  return index === -1 ? name : name.slice(index + 1);
}

/** Reads an attribute by exact name, then by local name (`r:embed` or `embed`). */
export function attr(element: XmlElement, name: string): string | undefined {
  const exact = element.attributes[name];
  if (exact !== undefined) return exact;
  const wanted = localName(name);
  for (const [key, value] of Object.entries(element.attributes)) {
    if (localName(key) === wanted) return value;
  }
  return undefined;
}

/** First direct child element with this local tag name. */
export function child(element: XmlElement, tag: string): XmlElement | undefined {
  const wanted = localName(tag);
  for (const node of element.children) {
    if (typeof node !== 'string' && localName(node.name) === wanted) return node;
  }
  return undefined;
}

/** Direct child elements with this local tag name, in document order. */
export function children(element: XmlElement, tag: string): XmlElement[] {
  const wanted = localName(tag);
  const found: XmlElement[] = [];
  for (const node of element.children) {
    if (typeof node !== 'string' && localName(node.name) === wanted) found.push(node);
  }
  return found;
}

/** Descendant elements with this local tag name. The element itself is not included. */
export function descendants(element: XmlElement, tag: string): XmlElement[] {
  const wanted = localName(tag);
  const found: XmlElement[] = [];
  const walk = (node: XmlElement) => {
    for (const nested of node.children) {
      if (typeof nested === 'string') continue;
      if (localName(nested.name) === wanted) found.push(nested);
      walk(nested);
    }
  };
  walk(element);
  return found;
}

/** Concatenated text of an element and its descendants. */
export function textContent(element: XmlElement): string {
  let out = '';
  for (const node of element.children) {
    out += typeof node === 'string' ? node : textContent(node);
  }
  return out;
}

function decodeEntity(token: string): string | null {
  switch (token) {
    case 'amp':
      return '&';
    case 'lt':
      return '<';
    case 'gt':
      return '>';
    case 'quot':
      return '"';
    case 'apos':
      return "'";
    default: {
      const hex = token[0] === '#' && (token[1] === 'x' || token[1] === 'X');
      const decimal =
        token[0] === '#' && token[1] !== undefined && token[1] >= '0' && token[1] <= '9';
      if (!hex && !decimal) return null;
      const code = hex ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
      if (code >= 0xd800 && code <= 0xdfff) return null;
      return String.fromCodePoint(code);
    }
  }
}

/** Decodes XML character entities once. Unknown entities are left in place. */
export function decodeEntities(value: string): string {
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '&') {
      out += char ?? '';
      continue;
    }
    const semi = value.indexOf(';', index + 1);
    if (semi === -1 || semi - index > 16) {
      out += '&';
      continue;
    }
    const decoded = decodeEntity(value.slice(index + 1, semi));
    if (decoded === null) {
      out += '&';
      continue;
    }
    out += decoded;
    index = semi;
  }
  return out;
}

class XmlParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parseDocument(): XmlElement | null {
    this.skipBom();
    if (!this.skipMisc()) return null;
    if (this.peek() !== '<') return null;
    const root = this.parseElement();
    if (!root) return null;
    if (!this.skipMisc()) return null;
    if (!this.eof()) return null;
    return root;
  }

  private eof(): boolean {
    return this.index >= this.source.length;
  }

  private peek(): string | undefined {
    return this.source[this.index];
  }

  private startsWith(token: string): boolean {
    return this.source.startsWith(token, this.index);
  }

  private consume(token: string): boolean {
    if (!this.startsWith(token)) return false;
    this.index += token.length;
    return true;
  }

  private skipBom(): void {
    if (this.source.charCodeAt(0) === 0xfeff) this.index = 1;
  }

  private skipSpaces(): void {
    while (!this.eof()) {
      const char = this.peek();
      if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') break;
      this.index += 1;
    }
  }

  private skipMisc(): boolean {
    for (;;) {
      this.skipSpaces();
      if (this.startsWith('<!--')) {
        if (!this.skipComment()) return false;
        continue;
      }
      if (this.startsWith('<?')) {
        if (!this.skipUntil('?>')) return false;
        continue;
      }
      if (this.startsWith('<!DOCTYPE') || this.startsWith('<!doctype')) {
        if (!this.skipDoctype()) return false;
        continue;
      }
      return true;
    }
  }

  private skipComment(): boolean {
    if (!this.consume('<!--')) return false;
    return this.skipUntil('-->');
  }

  private skipUntil(token: string): boolean {
    const found = this.source.indexOf(token, this.index);
    if (found === -1) return false;
    this.index = found + token.length;
    return true;
  }

  private skipDoctype(): boolean {
    this.index += 2;
    let quote: string | null = null;
    let brackets = 0;
    while (!this.eof()) {
      const char = this.source[this.index] ?? '';
      this.index += 1;
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '[') brackets += 1;
      else if (char === ']') brackets = Math.max(0, brackets - 1);
      else if (char === '>' && brackets === 0) return true;
    }
    return false;
  }

  private readName(): string | null {
    const start = this.index;
    const first = this.peek();
    if (first === undefined || !isNameStart(first)) return null;
    this.index += 1;
    while (!this.eof()) {
      const char = this.peek();
      if (char === undefined || !isNameChar(char)) break;
      this.index += 1;
    }
    const name = this.source.slice(start, this.index);
    return name.length > 0 ? name : null;
  }

  private readQuoted(): string | null {
    const quote = this.peek();
    if (quote !== '"' && quote !== "'") return null;
    this.index += 1;
    const start = this.index;
    const end = this.source.indexOf(quote, this.index);
    if (end === -1) return null;
    const raw = this.source.slice(start, end);
    this.index = end + 1;
    return decodeEntities(raw);
  }

  private readCdata(): string | null {
    if (!this.consume('<![CDATA[')) return null;
    const start = this.index;
    const end = this.source.indexOf(']]>', this.index);
    if (end === -1) return null;
    this.index = end + 3;
    return this.source.slice(start, end);
  }

  private parseElement(): XmlElement | null {
    if (!this.consume('<')) return null;
    if (this.peek() === '/' || this.peek() === '!' || this.peek() === '?') return null;
    const name = this.readName();
    if (!name) return null;
    const attributes: Record<string, string> = {};
    for (;;) {
      this.skipSpaces();
      if (this.consume('/>')) return { name, attributes, children: [] };
      if (this.consume('>')) break;
      const attrName = this.readName();
      if (!attrName) return null;
      this.skipSpaces();
      if (!this.consume('=')) return null;
      this.skipSpaces();
      const value = this.readQuoted();
      if (value === null) return null;
      attributes[attrName] = value;
    }
    return this.parseChildren(name, attributes);
  }

  private parseChildren(name: string, attributes: Record<string, string>): XmlElement | null {
    const children: XmlChild[] = [];
    let text = '';
    const pushText = () => {
      if (text.length === 0) return;
      children.push(text);
      text = '';
    };

    while (!this.eof()) {
      if (this.peek() !== '<') {
        const char = this.source[this.index] ?? '';
        this.index += 1;
        if (char === '&') {
          const semi = this.source.indexOf(';', this.index);
          if (semi !== -1 && semi - (this.index - 1) <= 16) {
            const decoded = decodeEntity(this.source.slice(this.index, semi));
            if (decoded !== null) {
              text += decoded;
              this.index = semi + 1;
              continue;
            }
          }
        }
        text += char;
        continue;
      }
      if (this.startsWith('</')) {
        pushText();
        this.index += 2;
        const closeName = this.readName();
        this.skipSpaces();
        if (closeName !== name || !this.consume('>')) return null;
        return { name, attributes, children: compactChildren(children) };
      }
      if (this.startsWith('<!--')) {
        pushText();
        if (!this.skipComment()) return null;
        continue;
      }
      if (this.startsWith('<![CDATA[')) {
        const data = this.readCdata();
        if (data === null) return null;
        text += data;
        continue;
      }
      if (this.startsWith('<?')) {
        pushText();
        if (!this.skipUntil('?>')) return null;
        continue;
      }
      if (this.startsWith('<!')) {
        pushText();
        if (!this.skipDoctype()) return null;
        continue;
      }
      pushText();
      const nested = this.parseElement();
      if (!nested) return null;
      children.push(nested);
    }
    return null;
  }
}

function isNameStart(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === '_' || char === ':';
}

function isNameChar(char: string): boolean {
  if (isNameStart(char)) return true;
  const code = char.codePointAt(0) ?? 0;
  return (code >= 48 && code <= 57) || char === '-' || char === '.';
}

function compactChildren(children: XmlChild[]): XmlChild[] {
  const hasElement = children.some((node) => typeof node !== 'string');
  const compact: XmlChild[] = [];
  for (const node of children) {
    if (typeof node !== 'string') {
      compact.push(node);
      continue;
    }
    if (node.length === 0) continue;
    if (hasElement && node.trim().length === 0) continue;
    const previous = compact[compact.length - 1];
    if (typeof previous === 'string') compact[compact.length - 1] = previous + node;
    else compact.push(node);
  }
  return compact;
}

/** Parses one XML document. Returns null when the input is empty or not well-formed. */
export function parseXml(xml: string): XmlElement | null {
  try {
    return new XmlParser(xml).parseDocument();
  } catch {
    return null;
  }
}
