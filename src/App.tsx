import { useCallback, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { Mermaid } from "./Mermaid";
import { parseHeadings } from "./markdown";
import { structureToMermaid } from "./diagram";

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
  const [showMap, setShowMap] = useState(true);
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

  const toc = useMemo(() => (content ? parseHeadings(content) : []), [content]);
  const structureChart = useMemo(
    () => (toc.length ? structureToMermaid(toc, fileName) : null),
    [toc, fileName]
  );

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
            {structureChart && (
              <section className="docmap">
                <div className="docmap-head">
                  <span className="docmap-title">🗺️ Document Map</span>
                  <span className="docmap-tag">auto-generated</span>
                  <button
                    className="btn docmap-toggle"
                    onClick={() => setShowMap((v) => !v)}
                  >
                    {showMap ? "Hide" : "Show"}
                  </button>
                </div>
                {showMap && <Mermaid chart={structureChart} />}
              </section>
            )}
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
