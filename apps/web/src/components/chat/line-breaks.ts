/**
 * A remark plugin that keeps single line breaks as breaks, the way the agent writes a plain answer
 * ("Total: 42 kW\nFiles: report.md"). Markdown would join such lines into one. Code, math and
 * anything else that isn't text keep their own line breaks.
 */

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** `node`'s children with each line break inside text made a break node. */
export function splitLineBreaks(node: MdNode): void {
  if (!node.children) return;
  const out: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.value?.includes("\n")) {
      child.value.split(/\r?\n/).forEach((part, i) => {
        if (i > 0) out.push({ type: "break" });
        if (part) out.push({ type: "text", value: part });
      });
    } else {
      splitLineBreaks(child);
      out.push(child);
    }
  }
  node.children = out;
}

export function remarkLineBreaks() {
  return (tree: MdNode) => splitLineBreaks(tree);
}
