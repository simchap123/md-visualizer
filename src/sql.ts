// Parse SQL DDL (CREATE TABLE …) into a structured schema, then render it as
// markdown: one navigable section per table (Column / Type / Key / References)
// plus a Mermaid ER diagram when the schema is small enough to draw cleanly.

type Ref = { table: string; cols: string[] };
type Column = {
  name: string;
  type: string;
  pk: boolean;
  fk: Ref | null;
  notNull: boolean;
};
type Table = {
  schema: string | null;
  name: string;
  columns: Column[];
};

const ER_MAX_TABLES = 24; // above this an ER diagram is unreadable / breaks mermaid
const ER_MAX_ATTRS = 18; // attributes shown per entity in the diagram

/** Return the inner text of the (...) starting at `open`, respecting quotes/nesting. */
function extractParen(s: string, open: number): { body: string; end: number } | null {
  let depth = 0;
  let q: string | null = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) {
        if (q === "'" && s[i + 1] === "'") i++;
        else q = null;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
    } else if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) return { body: s.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** Split a table body on top-level commas (ignoring commas in quotes/parens). */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let q: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === q) {
        if (q === "'" && s[i + 1] === "'") cur += s[++i];
        else q = null;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      cur += c;
    } else if (c === "(") {
      depth++;
      cur += c;
    } else if (c === ")") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Split "schema"."table" / schema.table / "table" / table into parts. */
function parseQualifiedName(raw: string): { schema: string | null; name: string } {
  const parts: string[] = [];
  let cur = "";
  let inq = false;
  for (const c of raw.trim()) {
    if (c === '"') {
      inq = !inq;
      continue;
    }
    if (c === "." && !inq) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  const clean = parts.map((p) => p.trim()).filter(Boolean);
  if (clean.length >= 2)
    return { schema: clean[clean.length - 2], name: clean[clean.length - 1] };
  return { schema: null, name: clean[0] ?? "" };
}

const COL_KEYWORDS = new Set([
  "PRIMARY",
  "REFERENCES",
  "NOT",
  "NULL",
  "DEFAULT",
  "UNIQUE",
  "CHECK",
  "GENERATED",
  "COLLATE",
  "CONSTRAINT",
]);

/** Separate a column's type from its trailing constraints. */
function splitTypeAndRest(rest: string): { type: string; rest: string } {
  let depth = 0;
  let q: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (q) {
      if (c === q) {
        if (q === "'" && rest[i + 1] === "'") i++;
        else q = null;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
    } else if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
    } else if (
      depth === 0 &&
      /[A-Za-z]/.test(c) &&
      (i === 0 || /[^A-Za-z0-9_]/.test(rest[i - 1]))
    ) {
      const word = (/^[A-Za-z_]+/.exec(rest.slice(i)) as RegExpExecArray)[0].toUpperCase();
      if (COL_KEYWORDS.has(word)) {
        return { type: rest.slice(0, i).trim(), rest: rest.slice(i).trim() };
      }
    }
  }
  return { type: rest.trim(), rest: "" };
}

function parseReference(rest: string): Ref | null {
  const m = /\bREFERENCES\s+("[^"]+"(?:\."[^"]+")?|[A-Za-z0-9_.]+)\s*(?:\(([^)]*)\))?/i.exec(
    rest
  );
  if (!m) return null;
  const { name } = parseQualifiedName(m[1]);
  const cols = (m[2] ?? "")
    .split(",")
    .map((c) => c.replace(/"/g, "").trim())
    .filter(Boolean);
  return { table: name, cols };
}

/** Parse a single comma-separated entry of a table body. */
function parseEntry(
  part: string,
  pkCols: Set<string>,
  fkByCol: Map<string, Ref>
): Column | null {
  const trimmed = part.trim();
  if (!trimmed) return null;
  const head = trimmed.replace(/^CONSTRAINT\s+(?:"[^"]+"|\S+)\s+/i, "");
  const upper = head.toUpperCase();

  // Table-level constraints: record PK/FK columns, emit no column.
  if (/^PRIMARY\s+KEY/.test(upper)) {
    const inner = extractParen(head, head.indexOf("("));
    inner?.body
      .split(",")
      .map((c) => c.replace(/"/g, "").trim())
      .forEach((c) => c && pkCols.add(c));
    return null;
  }
  if (/^FOREIGN\s+KEY/.test(upper)) {
    const open = head.indexOf("(");
    const inner = extractParen(head, open);
    const cols =
      inner?.body.split(",").map((c) => c.replace(/"/g, "").trim()) ?? [];
    const ref = parseReference(head.slice(inner ? inner.end : 0));
    if (ref) cols.forEach((c) => c && fkByCol.set(c, ref));
    return null;
  }
  if (/^(UNIQUE|CHECK|EXCLUDE|PRIMARY|FOREIGN)\b/.test(upper)) return null;

  // Otherwise it's a column definition.
  let name: string;
  let after: string;
  if (head[0] === '"') {
    const end = head.indexOf('"', 1);
    name = head.slice(1, end);
    after = head.slice(end + 1).trim();
  } else {
    const m = /^(\S+)\s*([\s\S]*)$/.exec(head);
    if (!m) return null;
    name = m[1];
    after = m[2];
  }
  const { type, rest } = splitTypeAndRest(after);
  const pk = /\bPRIMARY\s+KEY\b/i.test(rest);
  const notNull = /\bNOT\s+NULL\b/i.test(rest);
  const fk = parseReference(rest);
  return { name, type: type || "—", pk, notNull, fk };
}

export function parseSchema(sql: string): Table[] {
  const tables: Table[] = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi;
  while (re.exec(sql) !== null) {
    const open = sql.indexOf("(", re.lastIndex);
    if (open === -1) break;
    const rawName = sql.slice(re.lastIndex, open);
    const paren = extractParen(sql, open);
    if (!paren) continue;
    const { schema, name } = parseQualifiedName(rawName);
    if (!name) {
      re.lastIndex = open + 1;
      continue;
    }
    const pkCols = new Set<string>();
    const fkByCol = new Map<string, Ref>();
    const columns: Column[] = [];
    for (const part of splitTopLevel(paren.body)) {
      const col = parseEntry(part, pkCols, fkByCol);
      if (col) columns.push(col);
    }
    // Fold table-level PK/FK constraints back onto their columns.
    for (const col of columns) {
      if (pkCols.has(col.name)) col.pk = true;
      if (!col.fk && fkByCol.has(col.name)) col.fk = fkByCol.get(col.name)!;
    }
    tables.push({ schema, name, columns });
    re.lastIndex = paren.end + 1;
  }
  return tables;
}

const escCell = (s: string) =>
  s.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim();

function erDiagram(tables: Table[]): string | null {
  if (tables.length < 2 || tables.length > ER_MAX_TABLES) return null;

  // Build a unique, mermaid-safe entity id per table.
  const idOf = new Map<Table, string>();
  const used = new Set<string>();
  for (const t of tables) {
    let base = t.name.replace(/[^A-Za-z0-9_]/g, "_") || "table";
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}_${n++}`;
    used.add(id);
    idOf.set(t, id);
  }
  const byName = new Map(tables.map((t) => [t.name, t] as const));

  const lines = ["erDiagram"];
  for (const t of tables) {
    lines.push(`  ${idOf.get(t)} {`);
    for (const c of t.columns.slice(0, ER_MAX_ATTRS)) {
      const type =
        c.type.replace(/\([^)]*\)/g, "").replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "") ||
        "value";
      const cn = c.name.replace(/[^A-Za-z0-9_]/g, "_") || "col";
      const key = c.pk ? " PK" : c.fk ? " FK" : "";
      lines.push(`    ${type} ${cn}${key}`);
    }
    lines.push("  }");
  }
  for (const t of tables) {
    for (const c of t.columns) {
      if (!c.fk) continue;
      const parent = byName.get(c.fk.table);
      if (!parent) continue;
      const label = (c.fk.cols[0] ?? c.name).replace(/[^A-Za-z0-9_]/g, "_");
      lines.push(`  ${idOf.get(t)} }o--|| ${idOf.get(parent)} : "${label}"`);
    }
  }
  return lines.join("\n");
}

/** Render a parsed schema as markdown. Returns null if there are no tables. */
export function schemaToMarkdown(tables: Table[], fileName: string): string | null {
  if (!tables.length) return null;

  const schemas = new Set(tables.map((t) => t.schema ?? ""));
  const multiSchema = schemas.size > 1 || (schemas.size === 1 && !schemas.has(""));

  const out: string[] = [];
  out.push(`# 🗃️ ${fileName}`);
  out.push(
    `**${tables.length}** ${tables.length === 1 ? "table" : "tables"}` +
      (multiSchema ? ` across **${schemas.size}** schemas` : "")
  );

  const er = erDiagram(tables);
  if (er) {
    out.push("## Entity-Relationship Diagram");
    out.push("```mermaid\n" + er + "\n```");
  } else if (tables.length > ER_MAX_TABLES) {
    out.push(
      `> _ER diagram omitted — ${tables.length} tables is too many to draw clearly. ` +
        `Each table's structure is listed below._`
    );
  }

  let currentSchema: string | null | undefined;
  for (const t of tables) {
    if (multiSchema && t.schema !== currentSchema) {
      currentSchema = t.schema;
      out.push(`## ${currentSchema || "(no schema)"}`);
    }
    const heading = multiSchema ? "###" : "##";
    out.push(`${heading} ${t.schema ? `${t.schema}.` : ""}${t.name}`);
    // A GFM table must be one contiguous block — no blank lines between rows.
    const rows = ["| Column | Type | Key | References |", "| --- | --- | --- | --- |"];
    for (const c of t.columns) {
      const key = [c.pk ? "🔑 PK" : "", c.fk ? "🔗 FK" : ""]
        .filter(Boolean)
        .join(" ");
      const refs = c.fk
        ? `${c.fk.table}${c.fk.cols.length ? `(${c.fk.cols.join(", ")})` : ""}`
        : "";
      rows.push(
        `| ${escCell(c.name)} | ${escCell(c.type)}${c.notNull ? " · not null" : ""} | ${key} | ${escCell(refs)} |`
      );
    }
    out.push(rows.join("\n"));
  }
  return out.join("\n\n");
}
