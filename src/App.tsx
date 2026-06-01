import { useCallback, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import GithubSlugger from "github-slugger";
import { Mermaid } from "./Mermaid";

type TocItem = { depth: number; text: string; id: string };

/** Pull headings out of the raw markdown, skipping fenced code blocks. */
function buildToc(md: string): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  let inFence = false;
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!m) continue;
    const depth = m[1].length;
    // strip inline markdown decorations for a clean label
    const text = m[2]
      .replace(/[*_`~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .trim();
    if (!text) continue;
    items.push({ depth, text, id: slugger.slug(text) });
  }
  return items;
}

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const [content, setContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result ?? ""));
      setFileName(file.name);
      setFileSize(file.size);
      window.scrollTo({ top: 0 });
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const toc = useMemo(() => (content ? buildToc(content) : []), [content]);

  const components = useMemo(
    () => ({
      code({ className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const text = String(children).replace(/\n$/, "");
        if (match?.[1] === "mermaid") {
          return <Mermaid chart={text} />;
        }
        const isBlock = (className || "").startsWith("language-");
        if (isBlock) {
          return (
            <pre className="codeblock">
              <code {...props}>{children}</code>
            </pre>
          );
        }
        return (
          <code className="inline-code" {...props}>
            {children}
          </code>
        );
      },
      table({ children }: any) {
        return (
          <div className="table-wrap">
            <table>{children}</table>
          </div>
        );
      },
    }),
    []
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◧</span>
          <div>
            <div className="title">MD Visualizer</div>
            <div className="subtitle">Drop any markdown — read it like a doc</div>
          </div>
        </div>
        {fileName && (
          <div className="fileinfo">
            <span className="pill">{fileName}</span>
            <span className="muted">{readableSize(fileSize)}</span>
            <button className="btn" onClick={() => inputRef.current?.click()}>
              Open another
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".md,.markdown,.mdx,.txt,text/markdown"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFile(f);
            e.target.value = "";
          }}
        />
      </header>

      {!content ? (
        <main className="dropzone-wrap">
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <div className="dz-icon">⬆</div>
            <div className="dz-title">Drop a .md file here</div>
            <div className="dz-sub">or click to browse</div>
            <ul className="dz-feats">
              <li>📊 Tables rendered cleanly</li>
              <li>🧜 Mermaid diagrams drawn automatically</li>
              <li>🧭 Auto table of contents</li>
            </ul>
          </div>
        </main>
      ) : (
        <div className="layout">
          {toc.length > 0 && (
            <aside className="toc">
              <div className="toc-head">Contents</div>
              <nav>
                {toc.map((t, i) => (
                  <a
                    key={i}
                    href={`#${t.id}`}
                    className={`toc-link depth-${t.depth}`}
                  >
                    {t.text}
                  </a>
                ))}
              </nav>
            </aside>
          )}
          <main className="doc markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeSlug]}
              components={components}
            >
              {content}
            </ReactMarkdown>
          </main>
        </div>
      )}
    </div>
  );
}
