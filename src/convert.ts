// Turn non-markdown files into markdown the viewer can render:
//   .sql        -> a structured schema view (ER diagram + per-table columns)
//                  when it contains CREATE TABLE; otherwise a `sql` code block
//   .tsv / .csv -> a GitHub-flavored markdown table
// Anything else (md/markdown/mdx/txt) is passed through unchanged.

import { parseSchema, schemaToMarkdown } from "./sql";

function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore — handled by the following \n
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function delimitedToTable(text: string, delim: string): string {
  const rows = parseDelimited(text.replace(/\n+$/, ""), delim);
  if (!rows.length) return text;

  const cols = Math.max(...rows.map((r) => r.length));
  const esc = (s: string) =>
    (s ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim();
  const pad = (r: string[]) =>
    Array.from({ length: cols }, (_, i) => esc(r[i] ?? ""));

  const [header, ...body] = rows;
  const lines = [
    `| ${pad(header).join(" | ")} |`,
    `| ${Array(cols).fill("---").join(" | ")} |`,
    ...body.map((r) => `| ${pad(r).join(" | ")} |`),
  ];
  return lines.join("\n");
}

export function toRenderableMarkdown(raw: string, fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "sql") {
    const schema = schemaToMarkdown(parseSchema(raw), fileName);
    return schema ?? "```sql\n" + raw.replace(/\n$/, "") + "\n```";
  }
  if (ext === "tsv") return delimitedToTable(raw, "\t");
  if (ext === "csv") return delimitedToTable(raw, ",");
  return raw;
}
