// Turn non-markdown files into markdown the viewer can render:
//   .sql        -> a structured schema view (ER diagram + per-table columns)
//                  when it contains CREATE TABLE; otherwise a `sql` code block
//   .tsv / .csv -> a GitHub-flavored markdown table
// Anything else (md/markdown/mdx/txt) is passed through unchanged.

import { parseSchema, buildSchemaDoc } from "./sql";

// How many table sections render per page for a SQL schema. Large dumps
// (hundreds of tables) freeze the browser if mounted all at once.
const TABLES_PER_PAGE = 25;

export type Renderable =
  | { kind: "single"; markdown: string }
  | { kind: "paged"; header: string; pages: string[]; tableCount: number };

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

export function toRenderable(raw: string, fileName: string): Renderable {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "sql") {
    const doc = buildSchemaDoc(parseSchema(raw), fileName, TABLES_PER_PAGE);
    if (!doc) {
      // No CREATE TABLE — just a query. Show it as a code block.
      return { kind: "single", markdown: "```sql\n" + raw.replace(/\n$/, "") + "\n```" };
    }
    if (doc.pages.length <= 1) {
      return { kind: "single", markdown: `${doc.header}\n\n${doc.pages[0] ?? ""}` };
    }
    return { kind: "paged", header: doc.header, pages: doc.pages, tableCount: doc.tableCount };
  }
  if (ext === "tsv") return { kind: "single", markdown: delimitedToTable(raw, "\t") };
  if (ext === "csv") return { kind: "single", markdown: delimitedToTable(raw, ",") };
  return { kind: "single", markdown: raw };
}
