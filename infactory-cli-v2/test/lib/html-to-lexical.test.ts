/**
 * test/lib/html-to-lexical.test.ts — Tests für HTML→Lexical-Converter (M5.X).
 *
 * Inline-Fixtures statt separate Files: Lexical-JSON ist verbose, aber als
 * TS-Konstanten typsicher (LexicalRoot-Type fängt Schema-Drift sofort).
 *
 * Pure: keine Mocks, keine FS-Aufrufe, keine HTTP. Trivial determinism.
 */

import {expect} from 'chai'

import {
  decodeHtmlEntities,
  getAttr,
  hasComplexContent,
  htmlToLexical,
  parseInlineContent,
  splitTopLevelBlocks,
} from '../../src/lib/html-to-lexical.js'

/** Schiebt JSON-Round-Trip, damit wir gegen plain Object-Shapes vergleichen können. */
function lexicalRootOf(html: string): unknown {
  const result = htmlToLexical(html)
  if (!result.lexical) return null
  return JSON.parse(result.lexical)
}

describe('lib/html-to-lexical', () => {
  describe('decodeHtmlEntities (pure)', () => {
    it('basic named entities', () => {
      // 5 inter-entity spaces + 1 decoded nbsp (=space) am Ende = 11 chars
      expect(decodeHtmlEntities('&amp; &lt; &gt; &quot; &#39; &nbsp;'))
        .to.equal('& < > " \'  ')
    })

    it('decimal numeric entities', () => {
      expect(decodeHtmlEntities('&#65;&#66;')).to.equal('AB')
    })

    it('hex numeric entities (case-insensitive)', () => {
      expect(decodeHtmlEntities('&#x41;&#X42;')).to.equal('AB')
    })

    it('em-dash via hex', () => {
      expect(decodeHtmlEntities('hello&#x2014;world')).to.equal('hello\u2014world')
    })

    it('text without entities unverändert', () => {
      expect(decodeHtmlEntities('plain text')).to.equal('plain text')
    })
  })

  describe('getAttr (pure)', () => {
    it('extrahiert double-quoted', () => {
      expect(getAttr('src="x.png" alt="img"', 'src')).to.equal('x.png')
    })

    it('extrahiert single-quoted', () => {
      expect(getAttr("src='y.png'", 'src')).to.equal('y.png')
    })

    it('liefert leer-String wenn fehlend', () => {
      expect(getAttr('src="x"', 'alt')).to.equal('')
    })

    it('case-insensitive', () => {
      expect(getAttr('SRC="x.png"', 'src')).to.equal('x.png')
    })

    it('decoded HTML-Entities im Wert', () => {
      expect(getAttr('href="?a=1&amp;b=2"', 'href')).to.equal('?a=1&b=2')
    })
  })

  describe('hasComplexContent (pure)', () => {
    it('triggert bei BeTheme-Klasse mcb-', () => {
      expect(hasComplexContent('<div class="mcb-section">x</div>')).to.be.true
    })

    it('triggert bei rev_slider', () => {
      expect(hasComplexContent('<div class="rev_slider-wrapper">x</div>')).to.be.true
    })

    it('wso-privacy ist explizit ausgenommen', () => {
      expect(hasComplexContent('<div class="wso-privacy">simple</div>')).to.be.false
    })

    it('triggert bei mehr als 2 div-Tags', () => {
      expect(hasComplexContent('<div><div><div>3</div></div></div>')).to.be.true
    })

    it('triggert bei <table>', () => {
      expect(hasComplexContent('<table><tr><td>x</td></tr></table>')).to.be.true
    })

    it('triggert bei <iframe>', () => {
      expect(hasComplexContent('<iframe src="x"></iframe>')).to.be.true
    })

    it('einfacher Text ist NICHT komplex', () => {
      expect(hasComplexContent('<p>hello</p>')).to.be.false
    })
  })

  describe('splitTopLevelBlocks (pure)', () => {
    it('einfacher Block', () => {
      const blocks = splitTopLevelBlocks('<p>hello</p>')
      expect(blocks).to.have.length(1)
      expect(blocks[0].tag).to.equal('p')
      expect(blocks[0].innerHTML).to.equal('hello')
    })

    it('mehrere top-level Blocks', () => {
      const blocks = splitTopLevelBlocks('<p>a</p><h1>b</h1>')
      expect(blocks).to.have.length(2)
      expect(blocks.map((b) => b.tag)).to.deep.equal(['p', 'h1'])
    })

    it('verschachtelte Blocks werden NICHT gesplittet', () => {
      const blocks = splitTopLevelBlocks('<div><p>nested</p></div>')
      expect(blocks).to.have.length(1)
      expect(blocks[0].tag).to.equal('div')
      expect(blocks[0].innerHTML).to.contain('<p>nested</p>')
    })

    it('void elements (img, hr, br) werden direkt abgeschlossen', () => {
      const blocks = splitTopLevelBlocks('<img src="x"><hr>')
      expect(blocks).to.have.length(2)
      expect(blocks.map((b) => b.tag)).to.deep.equal(['img', 'hr'])
    })

    it('text vor erstem Tag wird als #text-Block aufgenommen', () => {
      const blocks = splitTopLevelBlocks('Hello <p>world</p>')
      expect(blocks).to.have.length(2)
      expect(blocks[0].tag).to.equal('#text')
      expect(blocks[0].innerHTML).to.equal('Hello')
    })

    it('robust gegen unclosed Tag am Ende', () => {
      const blocks = splitTopLevelBlocks('<p>hello')
      expect(blocks).to.have.length(1)
      expect(blocks[0].tag).to.equal('p')
      expect(blocks[0].innerHTML).to.equal('hello')
    })

    it('leerer Input → leeres Array', () => {
      expect(splitTopLevelBlocks('')).to.deep.equal([])
      expect(splitTopLevelBlocks('   ')).to.deep.equal([])
    })

    it('self-closing img mit /-Suffix', () => {
      const blocks = splitTopLevelBlocks('<img src="x"/>')
      expect(blocks).to.have.length(1)
      expect(blocks[0].tag).to.equal('img')
    })
  })

  describe('parseInlineContent (pure)', () => {
    it('plain text → ein Text-Node, format=0', () => {
      const nodes = parseInlineContent('hello')
      expect(nodes).to.have.length(1)
      expect(nodes[0]).to.deep.include({format: 0, text: 'hello', type: 'text'})
    })

    it('<strong> → format=1 (bold)', () => {
      const nodes = parseInlineContent('<strong>x</strong>')
      expect((nodes[0] as {format: number}).format).to.equal(1)
    })

    it('<em> → format=2 (italic)', () => {
      const nodes = parseInlineContent('<em>x</em>')
      expect((nodes[0] as {format: number}).format).to.equal(2)
    })

    it('verschachtelt <strong><em> → format=3 (bold+italic)', () => {
      const nodes = parseInlineContent('<strong><em>x</em></strong>')
      expect((nodes[0] as {format: number}).format).to.equal(3)
    })

    it('<u> → format=8 (underline)', () => {
      const nodes = parseInlineContent('<u>x</u>')
      expect((nodes[0] as {format: number}).format).to.equal(8)
    })

    it('<s>/<strike>/<del> → format=4 (strike)', () => {
      expect((parseInlineContent('<s>x</s>')[0] as {format: number}).format).to.equal(4)
      expect((parseInlineContent('<strike>x</strike>')[0] as {format: number}).format).to.equal(4)
      expect((parseInlineContent('<del>x</del>')[0] as {format: number}).format).to.equal(4)
    })

    it('<br> → linebreak-Node', () => {
      const nodes = parseInlineContent('a<br>b')
      expect(nodes.map((n) => n.type)).to.deep.equal(['text', 'linebreak', 'text'])
    })

    it('<a href="..."> → link-Node mit url', () => {
      const nodes = parseInlineContent('<a href="https://x.test">click</a>')
      expect(nodes).to.have.length(1)
      const link = nodes[0] as {children: Array<{text: string}>; type: string; url: string}
      expect(link.type).to.equal('link')
      expect(link.url).to.equal('https://x.test')
      expect(link.children[0].text).to.equal('click')
    })

    it('<a> mit rel/target/title werden übernommen', () => {
      const nodes = parseInlineContent(
        '<a href="https://x.test" rel="noopener" target="_blank" title="t">x</a>',
      )
      const link = nodes[0] as {rel: string; target: string; title: string}
      expect(link.rel).to.equal('noopener')
      expect(link.target).to.equal('_blank')
      expect(link.title).to.equal('t')
    })

    it('Entity-Decoding im Text', () => {
      const nodes = parseInlineContent('a &amp; b')
      expect((nodes[0] as {text: string}).text).to.equal('a & b')
    })

    it('leerer Input → leeres Array', () => {
      expect(parseInlineContent('')).to.deep.equal([])
      expect(parseInlineContent('   ')).to.deep.equal([])
    })

    it('unbekannte Inline-Tags (z.B. <span>) lassen Text durch', () => {
      const nodes = parseInlineContent('<span>x</span>')
      expect(nodes).to.have.length(1)
      expect((nodes[0] as {text: string}).text).to.equal('x')
    })
  })

  describe('htmlToLexical (Integration / Fixture-style)', () => {
    it('leerer Input → {} (kein lexical-Feld)', () => {
      expect(htmlToLexical('')).to.deep.equal({})
      expect(htmlToLexical(null)).to.deep.equal({})
      // eslint-disable-next-line unicorn/no-useless-undefined -- expliziter undefined-Test
      expect(htmlToLexical(undefined)).to.deep.equal({})
    })

    it('einfacher Paragraph', () => {
      const root = lexicalRootOf('<p>Hello world</p>') as {
        root: {children: Array<{children: Array<{text: string}>; type: string}>}
      }
      expect(root.root.children).to.have.length(1)
      expect(root.root.children[0].type).to.equal('paragraph')
      expect(root.root.children[0].children[0].text).to.equal('Hello world')
    })

    it('Headings h1-h6', () => {
      for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
        const root = lexicalRootOf(`<${tag}>Title</${tag}>`) as {
          root: {children: Array<{tag: string; type: string}>}
        }
        expect(root.root.children[0].type).to.equal('heading')
        expect(root.root.children[0].tag).to.equal(tag)
      }
    })

    it('hr → horizontalrule', () => {
      const root = lexicalRootOf('<hr>') as {root: {children: Array<{type: string}>}}
      expect(root.root.children[0].type).to.equal('horizontalrule')
    })

    it('img → image-Node mit src/alt/width/height', () => {
      const root = lexicalRootOf('<img src="x.png" alt="x" width="100" height="50">') as {
        root: {children: Array<{alt: string; height: number; src: string; width: number}>}
      }
      expect(root.root.children[0]).to.deep.include({
        alt: 'x',
        height: 50,
        src: 'x.png',
        width: 100,
      })
    })

    it('figure mit img + figcaption → image-Node mit caption', () => {
      const root = lexicalRootOf(
        '<figure><img src="x.png" alt="x"><figcaption>My caption</figcaption></figure>',
      ) as {root: {children: Array<{caption: string; src: string; type: string}>}}
      expect(root.root.children[0].type).to.equal('image')
      expect(root.root.children[0].caption).to.equal('My caption')
    })

    it('ul → list mit listType=bullet', () => {
      const root = lexicalRootOf('<ul><li>a</li><li>b</li></ul>') as {
        root: {children: Array<{children: unknown[]; listType: string; tag: string; type: string}>}
      }
      expect(root.root.children[0].type).to.equal('list')
      expect(root.root.children[0].listType).to.equal('bullet')
      expect(root.root.children[0].tag).to.equal('ul')
      expect(root.root.children[0].children).to.have.length(2)
    })

    it('ol → list mit listType=number', () => {
      const root = lexicalRootOf('<ol><li>a</li></ol>') as {
        root: {children: Array<{listType: string; tag: string}>}
      }
      expect(root.root.children[0].listType).to.equal('number')
      expect(root.root.children[0].tag).to.equal('ol')
    })

    it('blockquote → html-Card (Fallback)', () => {
      const root = lexicalRootOf('<blockquote>quoted</blockquote>') as {
        root: {children: Array<{html: string; type: string}>}
      }
      expect(root.root.children[0].type).to.equal('html')
      expect(root.root.children[0].html).to.contain('blockquote')
    })

    it('table → html-Card', () => {
      const root = lexicalRootOf('<table><tr><td>x</td></tr></table>') as {
        root: {children: Array<{type: string}>}
      }
      expect(root.root.children[0].type).to.equal('html')
    })

    it('iframe → html-Card', () => {
      const root = lexicalRootOf('<iframe src="x"></iframe>') as {
        root: {children: Array<{type: string}>}
      }
      expect(root.root.children[0].type).to.equal('html')
    })

    it('komplexer BeTheme-div → html-Card (hasComplexContent prüft innerHTML)', () => {
      // hasComplexContent inspiziert innerHTML, nicht outerHTML — Legacy-Verhalten.
      // Daher mcb-Klasse muss im innerHTML stehen, nicht nur am outer-div.
      const root = lexicalRootOf('<div><div class="mcb-section">complex</div></div>') as {
        root: {children: Array<{type: string}>}
      }
      expect(root.root.children[0].type).to.equal('html')
    })

    it('einfacher div wird unwrapped (rekursiver Convert)', () => {
      const root = lexicalRootOf('<div><p>simple</p></div>') as {
        root: {children: Array<{type: string}>}
      }
      expect(root.root.children[0].type).to.equal('paragraph')
    })

    it('Mixed Content: heading + paragraph + list', () => {
      const root = lexicalRootOf('<h1>Title</h1><p>Text</p><ul><li>a</li></ul>') as {
        root: {children: Array<{type: string}>}
      }
      expect(root.root.children.map((c) => c.type)).to.deep.equal(['heading', 'paragraph', 'list'])
    })

    it('Inline Format-Verschachtelung in Paragraph', () => {
      const root = lexicalRootOf('<p>plain <strong>bold <em>both</em></strong> end</p>') as {
        root: {children: Array<{children: Array<{format: number; text: string}>}>}
      }
      const inlines = root.root.children[0].children
      // plain (0), bold (1), bold+italic (3), end (0)
      expect(inlines.map((i) => i.format)).to.deep.equal([0, 1, 3, 0])
    })

    it('Link in Paragraph', () => {
      const root = lexicalRootOf('<p>see <a href="https://x.test">here</a></p>') as {
        root: {children: Array<{children: Array<{type: string}>}>}
      }
      const inlines = root.root.children[0].children
      expect(inlines.map((i) => i.type)).to.deep.equal(['text', 'link'])
    })

    it('Entity-Encoded HTML wird decoded', () => {
      const root = lexicalRootOf('<p>Tom&#39;s &amp; Jerry</p>') as {
        root: {children: Array<{children: Array<{text: string}>}>}
      }
      expect(root.root.children[0].children[0].text).to.equal("Tom's & Jerry")
    })

    it('leeres <p></p> wird übersprungen, leerer root → ein leerer paragraph', () => {
      const root = lexicalRootOf('<p></p>') as {
        root: {children: Array<{children: unknown[]; type: string}>}
      }
      // splitTopLevelBlocks erkennt das leere <p>, convertBlock returns null
      // → fallback ein leerer paragraph
      expect(root.root.children).to.have.length(1)
      expect(root.root.children[0].type).to.equal('paragraph')
      expect(root.root.children[0].children).to.deep.equal([])
    })

    it('Result ist JSON-stringified (Ghost-Convention)', () => {
      const result = htmlToLexical('<p>x</p>')
      expect(result.lexical).to.be.a('string')
      expect(() => JSON.parse(result.lexical!)).to.not.throw()
    })

    it('root-Wrapper hat type=root, version=1, direction=ltr', () => {
      const root = lexicalRootOf('<p>x</p>') as {
        root: {direction: string; type: string; version: number}
      }
      expect(root.root).to.deep.include({direction: 'ltr', type: 'root', version: 1})
    })
  })
})
