/* eslint-disable no-console */
/**
 * Finds JSX text nodes (e.g. "." or " - ") that are NOT inside a <Text>-like component.
 * Useful for debugging React Native error:
 *   "Text strings must be rendered within a <Text> component"
 *
 * Run:
 *   node scripts/find-unwrapped-jsx-text.js
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['app', 'components'];
const IGNORE_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'build']);

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      walk(full, out);
    } else if (ent.isFile()) {
      if (full.endsWith('.tsx')) out.push(full);
    }
  }
}

function isTextLikeTag(tagName) {
  // Allow common RN text containers (Text, Animated.Text, etc.)
  if (!tagName) return false;
  if (tagName === 'Text') return true;
  if (tagName.endsWith('.Text')) return true;
  return false;
}

function getOpeningTagName(node, sf) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText(sf);
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(sf);
  return null;
}

function hasTextLikeAncestor(node, sf) {
  let cur = node.parent;
  while (cur) {
    if (ts.isJsxElement(cur) || ts.isJsxSelfClosingElement(cur)) {
      const name = getOpeningTagName(cur, sf);
      if (isTextLikeTag(name)) return true;
    }
    cur = cur.parent;
  }
  return false;
}

function nearestJsxParentTag(node, sf) {
  let cur = node.parent;
  while (cur) {
    if (ts.isJsxElement(cur) || ts.isJsxSelfClosingElement(cur)) {
      return getOpeningTagName(cur, sf) || '<unknown>';
    }
    cur = cur.parent;
  }
  return '<root>';
}

function summarizeText(raw) {
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (compact.length <= 40) return compact;
  return compact.slice(0, 37) + '...';
}

function main() {
  const files = [];
  for (const d of TARGET_DIRS) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) walk(abs, files);
  }

  const matches = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    function visit(node) {
      if (ts.isJsxText(node)) {
        const raw = node.getText(sf);
        const stripped = raw.replace(/\s+/g, '');
        if (stripped.length > 0) {
          // If it's already inside <Text>-like component, it's fine.
          if (!hasTextLikeAncestor(node, sf)) {
            const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            matches.push({
              file: path.relative(ROOT, file),
              line: pos.line + 1,
              col: pos.character + 1,
              parent: nearestJsxParentTag(node, sf),
              text: summarizeText(raw),
              stripped,
              kind: 'jsxText',
            });
          }
        }
      }

      // Also catch string/number literals rendered via JSX expressions:
      //   <View>{'.'}</View>
      //   <View>{" ."}</View>
      //   <View>{123}</View>
      // Note: JsxExpression also appears in props (e.g. size={16}). We ONLY care about
      // expressions that are *children* of an element/fragment.
      if (
        ts.isJsxExpression(node) &&
        node.expression &&
        (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
      ) {
        const expr = node.expression;
        let raw = null;
        if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
          raw = expr.text;
        } else if (ts.isNumericLiteral(expr)) {
          raw = expr.text;
        }

        if (raw != null) {
          const stripped = String(raw).replace(/\s+/g, '');
          if (stripped.length > 0 && !hasTextLikeAncestor(node, sf)) {
            const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            matches.push({
              file: path.relative(ROOT, file),
              line: pos.line + 1,
              col: pos.character + 1,
              parent: nearestJsxParentTag(node, sf),
              text: summarizeText(String(raw)),
              stripped,
              kind: 'jsxExprLiteral',
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sf);
  }

  // Prefer reporting the common culprit: a single "." node.
  const dotOnly = matches.filter(m => m.stripped === '.');
  const out = dotOnly.length ? dotOnly : matches;

  if (!out.length) {
    console.log('No unwrapped JSX text nodes found.');
    return;
  }

  console.log(`Found ${out.length} unwrapped JSX text node(s):`);
  for (const m of out) {
    console.log(
      `- ${m.file}:${m.line}:${m.col} parent=<${m.parent}> kind=${m.kind} text="${m.text}" (stripped="${m.stripped}")`
    );
  }
}

main();

