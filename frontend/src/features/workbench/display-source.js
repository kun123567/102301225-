const commentAnchors = {
  floyd: { 'init-dist': 'init' },
  'topological-sort': { 'calc-degree': 'init-degree', 'push-zero': 'init-queue' },
  'block-search': { 'block-selected': 'inner-loop' }
};

// Match quoted literals before comments so comment markers inside literals stay visible.
const sourceTokens = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[^]*?\*\/|\/\/[^\r\n]*/g;

export function displaySourceLines(run) {
  const lines = run.sourceLines ?? [];
  if (run.algorithm === 'custom-array') return lines;
  // plus 示例的"源码行"其实是每一步的中文说明，不是 C 代码：去掉引号/注释剥离，否则引号里的字会丢
  if (run.plus) return lines.map(line => ({ ...line, text: line.text.trimEnd() }));
  return lines
    .map(line => ({ ...line, text: line.text.replace(sourceTokens, token => token.startsWith('/') ? ' ' : token).trimEnd() }))
    .filter(line => line.text.trim());
}

export function displayLineId(algorithm, lineId) {
  const anchors = Object.hasOwn(commentAnchors, algorithm) ? commentAnchors[algorithm] : null;
  return anchors && Object.hasOwn(anchors, lineId) ? anchors[lineId] : lineId;
}
