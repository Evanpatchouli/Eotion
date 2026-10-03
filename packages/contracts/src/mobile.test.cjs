const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const contractsRoot = path.resolve(__dirname, '..')
const repositoryRoot = path.resolve(contractsRoot, '..', '..')
const mobileAppRoot = path.join(repositoryRoot, 'apps', 'mobile', 'src')
const channel = 'eotion.mobile.p1'

function parseTypeScript(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function vueScripts(source, fileName) {
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match, index) => parseTypeScript(match[1], `${fileName}#script-${index + 1}`))
}

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(entryPath)
    return /\.(?:ts|vue)$/.test(entry.name) ? [entryPath] : []
  })
}

test('mobile subpath loads without evaluating contracts root or zod', () => {
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict')
    const mobile = require('@eotion/contracts/mobile')
    assert.equal(mobile.MOBILE_P1_CHANNEL, ${JSON.stringify(channel)})
    const loaded = Object.keys(require.cache).map((file) => file.replaceAll('\\\\', '/'))
    assert.equal(loaded.some((file) => file.includes('/contracts/dist/index.js')), false)
    assert.equal(loaded.some((file) => file.includes('/node_modules/zod/')), false)
  `], { cwd: contractsRoot, encoding: 'utf8' })

  assert.equal(child.status, 0, child.stderr || child.stdout)
})

test('root export preserves the mobile channel value', () => {
  const contracts = require('@eotion/contracts')
  assert.equal(contracts.MOBILE_P1_CHANNEL, channel)
})

test('mobile leaf has no runtime module dependencies', () => {
  const fileName = path.join(contractsRoot, 'src', 'mobile.ts')
  const sourceFile = parseTypeScript(fs.readFileSync(fileName, 'utf8'), fileName)
  const dependencies = []

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      dependencies.push(node.moduleSpecifier.getText(sourceFile))
    }
    if (ts.isCallExpression(node) && (
      (node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require')
    )) {
      dependencies.push(node.getText(sourceFile))
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  assert.deepEqual(dependencies, [])
})

test('mobile app source does not load contracts root at runtime', () => {
  const violations = []

  for (const fileName of listSourceFiles(mobileAppRoot)) {
    const source = fs.readFileSync(fileName, 'utf8')
    const sourceFiles = fileName.endsWith('.vue')
      ? vueScripts(source, fileName)
      : [parseTypeScript(source, fileName)]

    for (const sourceFile of sourceFiles) {
      function visit(node) {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@eotion/contracts') {
          const clause = node.importClause
          const hasRuntimeImport = !clause || (!clause.isTypeOnly && (
            Boolean(clause.name) ||
            Boolean(clause.namedBindings && !ts.isNamespaceImport(clause.namedBindings)
              ? clause.namedBindings.elements.some((element) => !element.isTypeOnly)
              : clause.namedBindings)
          ))
          if (hasRuntimeImport) violations.push(`${fileName}: ${node.getText(sourceFile)}`)
        }
        if (ts.isExportDeclaration(node) && node.moduleSpecifier?.text === '@eotion/contracts' && !node.isTypeOnly) {
          violations.push(`${fileName}: ${node.getText(sourceFile)}`)
        }
        if (ts.isCallExpression(node) && (
          (node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')
        )) {
          const [argument] = node.arguments
          if (argument && ts.isStringLiteralLike(argument) && argument.text === '@eotion/contracts') {
            violations.push(`${fileName}: ${node.getText(sourceFile)}`)
          }
        }
        if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
          const expression = node.moduleReference.expression
          if (ts.isStringLiteralLike(expression) && expression.text === '@eotion/contracts') {
            violations.push(`${fileName}: ${node.getText(sourceFile)}`)
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
    }
  }

  assert.deepEqual(violations, [])
})
