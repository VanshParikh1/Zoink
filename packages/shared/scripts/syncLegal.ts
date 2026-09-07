// Regenerates packages/shared/legal/{terms,privacy}.ts from the markdown source
// of truth in legal/*.md, so the text bundled into app builds can never
// silently drift from the documents users are shown at registration.
//
// Run via `npm run generate` at the repo root (wired alongside `prisma generate`).
import fs from 'fs'
import path from 'path'

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const LEGAL_SRC_DIR = path.join(REPO_ROOT, 'legal')
const LEGAL_OUT_DIR = path.join(REPO_ROOT, 'packages', 'shared', 'legal')

// Escape characters that would break out of a template literal.
function escapeForTemplateLiteral(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

function generate(sourceFile: string, versionConstName: string, textConstName: string, version: string): string {
  const mdPath = path.join(LEGAL_SRC_DIR, sourceFile)
  const raw = fs.readFileSync(mdPath, 'utf8')
  const escaped = escapeForTemplateLiteral(raw)

  return `// GENERATED FILE — do not edit by hand.
// Source: legal/${sourceFile}
// Regenerate with: npm run generate (packages/shared/scripts/syncLegal.ts)

export const ${versionConstName} = '${version}'

export const ${textConstName} = \`${escaped}\`
`
}

function main() {
  fs.mkdirSync(LEGAL_OUT_DIR, { recursive: true })

  const terms = generate('terms.md', 'TERMS_VERSION', 'TERMS_TEXT', '1.0')
  fs.writeFileSync(path.join(LEGAL_OUT_DIR, 'terms.ts'), terms)

  const privacy = generate('privacy.md', 'PRIVACY_VERSION', 'PRIVACY_TEXT', '1.0')
  fs.writeFileSync(path.join(LEGAL_OUT_DIR, 'privacy.ts'), privacy)

  const index = `export * from './terms'
export * from './privacy'
`
  fs.writeFileSync(path.join(LEGAL_OUT_DIR, 'index.ts'), index)

  console.log('Synced legal text into packages/shared/legal/ from legal/*.md')
}

main()
