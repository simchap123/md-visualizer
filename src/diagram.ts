import type { Heading } from "./markdown";

const MAX_NODES = 60;
const WRAP_AT = 24; // chars per line before wrapping
const HARD_CAP = 160; // absolute safety limit

/** Escape characters that are invalid in mermaid's HTML node labels. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Sanitize a heading and wrap it onto multiple lines so nothing is cut off. */
function label(text: string): string {
  let t = text
    .replace(/["#]/g, "")
    .replace(/[{}[\]()|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return " ";
  if (t.length > HARD_CAP) t = t.slice(0, HARD_CAP - 1).trimEnd() + "…";

  const lines: string[] = [];
  let cur = "";
  for (const word of t.split(" ")) {
    if (cur && cur.length + 1 + word.length > WRAP_AT) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) lines.push(cur);
  // Escape each line (mermaid renders these as HTML), then join with <br/>.
  return lines.map(escapeHtml).join("<br/>");
}

/**
 * Auto-generate a colored mermaid flowchart from a document's heading tree.
 * Returns null when there isn't enough structure to be worth drawing.
 */
export function structureToMermaid(
  headings: Heading[],
  title: string
): string | null {
  if (headings.length < 2) return null;

  // Keep the diagram readable: drop the deepest levels until we fit MAX_NODES.
  let maxDepth = 6;
  let kept = headings;
  while (kept.length > MAX_NODES && maxDepth > 1) {
    maxDepth -= 1;
    kept = headings.filter((h) => h.depth <= maxDepth);
  }
  if (kept.length > MAX_NODES) kept = kept.slice(0, MAX_NODES);
  if (kept.length < 2) return null;

  const docName = label(title.replace(/\.(md|markdown|mdx|txt)$/i, "")) || "Document";
  const lines: string[] = ["graph LR"];

  // Root node.
  lines.push(`  root["📄 ${docName}"]:::d0`);

  // Node definitions.
  kept.forEach((h, i) => {
    const cls = `d${Math.min(h.depth, 4)}`;
    lines.push(`  n${i}["${label(h.text)}"]:::${cls}`);
  });

  // Edges: connect each heading to the nearest preceding heading of lower depth,
  // falling back to the root.
  kept.forEach((h, i) => {
    let parent = "root";
    for (let j = i - 1; j >= 0; j--) {
      if (kept[j].depth < h.depth) {
        parent = `n${j}`;
        break;
      }
    }
    lines.push(`  ${parent} --> n${i}`);
  });

  // Color palette by depth.
  lines.push(
    "  classDef d0 fill:#0969da,color:#ffffff,stroke:#0b4f9e,stroke-width:1px;",
    "  classDef d1 fill:#ddf4ff,color:#0a3069,stroke:#54aeff,stroke-width:1px;",
    "  classDef d2 fill:#dafbe1,color:#0a3622,stroke:#4ac26b,stroke-width:1px;",
    "  classDef d3 fill:#fff8c5,color:#4d2d00,stroke:#d4a72c,stroke-width:1px;",
    "  classDef d4 fill:#ffeff7,color:#5e103e,stroke:#e85aad,stroke-width:1px;"
  );

  const truncated = kept.length < headings.filter((h) => h.depth <= maxDepth).length
    || maxDepth < 6 && headings.some((h) => h.depth > maxDepth);
  if (truncated) {
    lines.push(`  note["… deeper sections hidden for clarity"]:::d4`);
  }

  return lines.join("\n");
}
