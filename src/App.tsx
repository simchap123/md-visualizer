import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { Mermaid } from "./Mermaid";
import { parseHeadings } from "./markdown";
import { structureToMermaid } from "./diagram";
import {
  addEntry,
  clearHistory,
  loadHistory,
  removeEntry,
  type HistoryEntry,
} from "./history";

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function App() {
  const [content, setContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [activeId, setActiveId] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const showEntry = useCallback((entry: HistoryEntry) => {
    setContent(entry.content);
    setFileName(entry.name);
    setFileSize(entry.size);
    setActiveId(entry.id);
    window.scrollTo({ top: 0 });
  }, []);

  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setContent(text);
      setFileName(file.name);
      setFileSize(file.size);
      const { id, history } = addEntry(file.name, file.size, text);
      setActiveId(id);
      setHistory(history);
      window.scrollTo({ top: 0 });
    };
    reader.readAsText(file);
  }, []);

  const reset = useCallback(() => {
    setContent("");
    setFileName("");
    setFileSize(0);
    setActiveId("");
  }, []);

  const deleteEntry = useCallback(
    (id: string) => {
      setHistory(removeEntry(id));
      if (id === activeId) reset();
    },
    [activeId, reset]
  );

  const clearAll = useCallback(() => {
    setHistory(clearHistory());
    reset();
  }, [reset]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  // Accept a dragged file anywhere in the window once a doc is open.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
    };
  }, []);

  const filteredHistory = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q)
    );
  }, [history, query]);

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
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <header className="topbar">
        <button
          className="iconbtn sidebar-toggle"
          title={sidebarOpen ? "Hide library" : "Show library"}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          ☰
        </button>
        <div className="brand">
          <span className="logo">◧</span>
          <div>
            <div className="title">MD Visualizer</div>
            <div className="subtitle">Drop any markdown — read it like a doc</div>
          </div>
        </div>

        {/* Persistent drop strip — drag a new doc in any time, or click to browse */}
        <div
          className={`dropstrip ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          title="Drop a .md file or click to browse"
        >
          <span className="dropstrip-icon">⬆</span>
          <span className="dropstrip-text">Drop a new .md here</span>
        </div>

        {fileName && (
          <div className="fileinfo">
            <span className="pill">{fileName}</span>
            <span className="muted">{readableSize(fileSize)}</span>
            <button className="btn" onClick={reset} title="Clear the document">
              Reset
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

      <div className={`shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <aside className="library">
          <div className="library-head">
            <span className="library-title">Library</span>
            <span className="library-count">{history.length}</span>
            {history.length > 0 && (
              <button
                className="linkbtn"
                onClick={clearAll}
                title="Remove all saved documents"
              >
                Clear all
              </button>
            )}
          </div>
          <input
            className="library-search"
            type="search"
            placeholder="Search your markdown…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="library-list">
            {history.length === 0 ? (
              <div className="library-empty">
                Opened documents are saved here, on this device only.
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="library-empty">No matches.</div>
            ) : (
              filteredHistory.map((e) => (
                <div
                  key={e.id}
                  className={`library-item ${e.id === activeId ? "active" : ""}`}
                  onClick={() => showEntry(e)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="library-item-main">
                    <div className="library-item-name">{e.name}</div>
                    <div className="library-item-meta">
                      {readableSize(e.size)} · {relativeTime(e.savedAt)}
                    </div>
                  </div>
                  <button
                    className="library-del"
                    title="Remove from library"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      deleteEntry(e.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className="workspace">
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
      </div>

      {dragging && content && (
        <div className="drag-overlay">
          <div className="drag-overlay-card">⬇ Drop to open a new document</div>
        </div>
      )}
    </div>
  );
}
