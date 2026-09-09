#!/usr/bin/env node
/*
 * Renders legal/terms.md and legal/privacy.md into styled static pages
 * (landing/terms.html, landing/privacy.html) that match landing/index.html's
 * treatment. Run from anywhere: `node landing/build-legal.js`.
 *
 * Same source-of-truth discipline as packages/shared/scripts/syncLegal.ts:
 * the markdown in legal/*.md is authoritative; never hand-edit the .html.
 * Re-run this after touching legal/terms.md or legal/privacy.md.
 *
 * Zero dependencies — small purpose-built parser for the markdown subset the
 * two documents actually use (headings, bold, links, tables, - and 1. lists,
 * --- rules). No blockquotes or inline code appear in either document.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const LEGAL_DIR = path.join(ROOT, 'legal')
const OUT_DIR = __dirname

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Inline: escape first, then bold, links, em. Rewrite intra-repo doc links to
// the published page names.
function inline(text) {
  let s = escapeHtml(text)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    let h = href.trim()
    if (h === './privacy.md' || h === 'privacy.md') h = 'privacy.html'
    else if (h === './terms.md' || h === 'terms.md') h = 'terms.html'
    const external = /^https?:\/\//i.test(h)
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${h}"${attrs}>${label}</a>`
  })
  // single-asterisk emphasis (rare in these docs), after bold has consumed **
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  return s
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// Heading id: the leading clause number ("7", "10.1", "2.4") when present,
// else a slug. Numeric anchors keep legal cross-references stable.
function headingId(text) {
  const m = text.match(/^(\d+(?:\.\d+)?)[.)]?\s/)
  return m ? m[1] : slugify(text)
}

function renderTable(rows) {
  // rows: array of raw "| a | b |" strings; row[1] is the --- separator
  const cells = (line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
  const header = cells(rows[0])
  const body = rows.slice(2).map(cells)
  let out = '<div class="table-wrap"><table>\n<thead><tr>'
  out += header.map((c) => `<th>${inline(c)}</th>`).join('')
  out += '</tr></thead>\n<tbody>\n'
  for (const r of body) {
    out += '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>\n'
  }
  out += '</tbody>\n</table></div>'
  return out
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out = []
  const toc = []
  let i = 0

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${buf.map(inline).join('<br>\n')}</p>`)
  }

  while (i < lines.length) {
    let line = lines[i]

    if (/^\s*$/.test(line)) {
      i++
      continue
    }

    // horizontal rule
    if (/^-{3,}\s*$/.test(line)) {
      out.push('<hr>')
      i++
      continue
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const text = h[2].trim()
      const id = headingId(text)
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`)
      if (level === 2) toc.push({ id, text })
      i++
      continue
    }

    // table (current line starts with | and the next line is a |---| divider)
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const rows = []
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i])
        i++
      }
      out.push(renderTable(rows))
      continue
    }

    // unordered list
    if (/^[-*]\s+/.test(line)) {
      out.push('<ul>')
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        out.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`)
        i++
      }
      out.push('</ul>')
      continue
    }

    // ordered list
    if (/^\d+[.)]\s+/.test(line)) {
      out.push('<ol>')
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        out.push(`<li>${inline(lines[i].replace(/^\d+[.)]\s+/, ''))}</li>`)
        i++
      }
      out.push('</ol>')
      continue
    }

    // paragraph: consume consecutive plain lines
    const buf = []
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^-{3,}\s*$/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+[.)]\s+/.test(lines[i]) &&
      !/^\|/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    flushParagraph(buf)
  }

  return { body: out.join('\n'), toc }
}

function page({ title, heading, updated, body, toc, otherHref, otherLabel }) {
  const tocHtml = toc
    .map((t) => `<li><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`)
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(title)} for Zoink, the verified student rental marketplace.">
  <title>${escapeHtml(title)} | Zoink</title>
  <link rel="icon" href="assets/logo.png">
  <style>
    :root {
      --acid: #00ef20;
      --acid-soft: #c8ff59;
      --forest: #248232;
      --ink: #040f0f;
      --slate: #2d3a3a;
      --cream: #f4ede1;
      --paper: #fff9ef;
      --sand: #e5dccb;
      --muted: #6d756d;
      --line: rgba(4, 15, 15, 0.14);
      --radius-lg: 24px;
      --radius-md: 16px;
      color-scheme: light;
      font-family: "Trebuchet MS", "Avenir Next", Verdana, sans-serif;
      color: var(--ink);
      background: var(--cream);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-width: 320px;
      line-height: 1.6;
      background:
        radial-gradient(circle at 14% 4%, rgba(0, 239, 32, 0.20), transparent 24rem),
        radial-gradient(circle at 86% 2%, rgba(200, 255, 89, 0.22), transparent 20rem),
        var(--cream);
    }
    a { color: var(--forest); text-decoration: underline; text-underline-offset: 2px; }
    a:hover, a:focus-visible { color: var(--ink); }
    img { max-width: 100%; display: block; }
    p, h1, h2, h3, h4, ul, ol, table { margin-top: 0; }

    .shell { width: min(880px, calc(100% - 40px)); margin: 0 auto; }

    .nav {
      position: sticky;
      top: 0;
      z-index: 30;
      background: rgba(244, 237, 225, 0.82);
      border-bottom: 2px solid var(--ink);
      backdrop-filter: blur(18px);
    }
    .nav-inner {
      width: min(1160px, calc(100% - 36px));
      margin: 0 auto;
      min-height: 72px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }
    .brand { display: inline-flex; align-items: center; }
    .brand-plate {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border: 2px solid var(--ink);
      border-radius: 999px;
      background: var(--ink);
      box-shadow: 4px 4px 0 var(--acid);
    }
    .brand img { width: 128px; height: auto; }
    .nav a.back {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border: 2px solid var(--ink);
      border-radius: 999px;
      background: var(--paper);
      color: var(--ink);
      text-decoration: none;
      font-weight: 900;
      box-shadow: 4px 4px 0 var(--ink);
    }
    .nav a.back:hover, .nav a.back:focus-visible {
      transform: translate(2px, 2px);
      box-shadow: 2px 2px 0 var(--ink);
      outline: none;
    }

    main { padding: 52px 0 72px; }
    .doc-head { margin-bottom: 34px; padding-bottom: 22px; border-bottom: 3px solid var(--ink); }
    .kicker {
      display: inline-block;
      margin-bottom: 16px;
      padding: 7px 12px;
      border: 2px solid var(--ink);
      border-radius: 999px;
      background: var(--paper);
      box-shadow: 4px 4px 0 var(--ink);
      font-size: 12px;
      font-weight: 950;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    h1 {
      font-size: clamp(36px, 6vw, 60px);
      line-height: 0.92;
      letter-spacing: -0.06em;
      font-weight: 950;
      margin-bottom: 10px;
    }
    .updated { color: var(--muted); font-weight: 850; font-size: 14px; }

    .toc {
      margin-bottom: 40px;
      padding: 20px 22px;
      border: 3px solid var(--ink);
      border-radius: var(--radius-lg);
      background: var(--paper);
      box-shadow: 8px 8px 0 var(--ink);
    }
    .toc strong {
      display: block;
      margin-bottom: 12px;
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .toc ol { margin: 0; padding-left: 0; list-style: none; columns: 2; column-gap: 28px; }
    .toc li { margin-bottom: 6px; break-inside: avoid; }
    .toc a { color: var(--slate); text-decoration: none; font-weight: 800; }
    .toc a:hover { color: var(--forest); text-decoration: underline; }

    .doc h2 {
      margin-top: 44px;
      margin-bottom: 12px;
      padding-top: 8px;
      font-size: clamp(24px, 3.4vw, 34px);
      line-height: 1;
      letter-spacing: -0.04em;
      font-weight: 950;
      scroll-margin-top: 90px;
    }
    .doc h3 {
      margin-top: 30px;
      margin-bottom: 10px;
      font-size: 19px;
      letter-spacing: -0.02em;
      font-weight: 900;
      scroll-margin-top: 90px;
    }
    .doc p { margin-bottom: 16px; }
    .doc ul, .doc ol { margin-bottom: 18px; padding-left: 24px; }
    .doc li { margin-bottom: 8px; }
    .doc hr { border: none; border-top: 2px dashed var(--line); margin: 8px 0 24px; }
    .doc strong { font-weight: 900; }

    .table-wrap { overflow-x: auto; margin-bottom: 22px; }
    .doc table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid var(--ink);
      font-size: 15px;
    }
    .doc th, .doc td {
      padding: 10px 12px;
      border: 1px solid var(--ink);
      text-align: left;
      vertical-align: top;
    }
    .doc th { background: var(--acid-soft); font-weight: 950; }
    .doc tbody tr:nth-child(even) td { background: rgba(255, 249, 239, 0.6); }

    .footer { padding: 26px 0 40px; border-top: 3px solid var(--ink); background: var(--paper); }
    .footer-inner {
      width: min(1160px, calc(100% - 36px));
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      color: var(--slate);
      font-weight: 850;
    }
    .footer-links { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; font-weight: 950; }
    .footer-links a { color: var(--slate); text-decoration: none; }
    .footer-links a:hover, .footer-links a:focus-visible { color: var(--forest); outline: none; }

    @media (prefers-reduced-motion: reduce) {
      * { scroll-behavior: auto !important; }
    }
    @media (max-width: 680px) {
      .brand img { width: 108px; }
      .toc ol { columns: 1; }
      main { padding-top: 36px; }
      .footer-inner { display: block; }
      .footer-links { margin-top: 12px; }
    }
  </style>
</head>
<body>
  <nav class="nav" aria-label="Main navigation">
    <div class="nav-inner">
      <a class="brand" href="index.html" aria-label="Zoink home">
        <span class="brand-plate"><img src="assets/ZoinkTransparent.png" alt="Zoink"></span>
      </a>
      <a class="back" href="index.html">&larr; Back to Zoink</a>
    </div>
  </nav>

  <main class="shell">
    <div class="doc-head">
      <span class="kicker">Legal</span>
      <h1>${escapeHtml(heading)}</h1>
      <p class="updated">${escapeHtml(updated)}</p>
    </div>

    <nav class="toc" aria-label="Table of contents">
      <strong>On this page</strong>
      <ol>
${tocHtml}
      </ol>
    </nav>

    <article class="doc">
${body}
    </article>
  </main>

  <footer class="footer">
    <div class="footer-inner">
      <span>Copyright 2026 Zoink campus rentals</span>
      <div class="footer-links">
        <a href="index.html">Home</a>
        <a href="${otherHref}">${otherLabel}</a>
        <a href="mailto:zoinksupport@gmail.com">zoinksupport@gmail.com</a>
      </div>
    </div>
  </footer>
</body>
</html>
`
}

function build(srcFile, { title, heading, outFile, otherHref, otherLabel }) {
  const md = fs.readFileSync(path.join(LEGAL_DIR, srcFile), 'utf8')
  const { body, toc } = mdToHtml(md)

  // Pull "Last updated" line for the header stamp, then drop the top matter
  // (H1 + effective/updated lines + first ---) from the rendered body so it
  // isn't duplicated under our styled doc-head.
  const updatedMatch = md.match(/\*\*Last updated:\*\*\s*(.+)/)
  const effectiveMatch = md.match(/\*\*Effective date:\*\*\s*(.+)/)
  const stamp =
    (effectiveMatch ? `Effective ${effectiveMatch[1].trim()}` : '') +
    (effectiveMatch && updatedMatch ? '  ·  ' : '') +
    (updatedMatch ? `Last updated ${updatedMatch[1].trim()}` : '')

  let trimmedBody = body
    .replace(/^<h1[^>]*>[\s\S]*?<\/h1>\s*/, '')
    .replace(/^<p><strong>Effective date:[\s\S]*?<\/p>\s*/, '')
    .replace(/^<hr>\s*/, '')

  const html = page({
    title,
    heading,
    updated: stamp,
    body: trimmedBody,
    toc: toc.filter((t) => !/^zoink (—|-)/i.test(t.text)),
    otherHref,
    otherLabel,
  })
  fs.writeFileSync(path.join(OUT_DIR, outFile), html)
  console.log(`wrote landing/${outFile}  (${toc.length} sections)`)
}

build('terms.md', {
  title: 'Terms of Service',
  heading: 'Terms of Service',
  outFile: 'terms.html',
  otherHref: 'privacy.html',
  otherLabel: 'Privacy',
})
build('privacy.md', {
  title: 'Privacy Policy',
  heading: 'Privacy Policy',
  outFile: 'privacy.html',
  otherHref: 'terms.html',
  otherLabel: 'Terms',
})
