import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

// NOTE: do NOT set fontFamily to "inherit". Mermaid measures label widths with
// the configured font; if the rendered (inherited) font is wider, node boxes come
// out too narrow and text is clipped. Use Mermaid's own consistent default font.
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  flowchart: { htmlLabels: true, wrappingWidth: 220 },
  themeVariables: {
    primaryColor: "#ddf4ff",
    primaryTextColor: "#0a3069",
    primaryBorderColor: "#54aeff",
    lineColor: "#57606a",
    secondaryColor: "#dafbe1",
    tertiaryColor: "#fff8c5",
    fontSize: "15px",
  },
});

// Render only after web fonts are loaded so width measurement matches what paints.
const fontsReady: Promise<unknown> =
  typeof document !== "undefined" && "fonts" in document
    ? (document as Document).fonts.ready
    : Promise.resolve();

/** Renders a Mermaid block as SVG, with a colored theme and a zoomable fullscreen view. */
export function Mermaid({ chart }: { chart: string }) {
  const reactId = useId();
  const id = "m" + reactId.replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fontsReady
      .then(() => mermaid.render(id, chart))
      .then((res) => {
        if (!cancelled) setSvg(res.svg);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  useEffect(() => {
    if (ref.current && svg) ref.current.innerHTML = svg;
  }, [svg]);

  if (error) {
    return (
      <div className="mermaid-error">
        <div className="mermaid-error-label">Could not render diagram</div>
        <pre className="codeblock">
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  return (
    <>
      <div className="mermaid-card">
        <button
          className="mermaid-expand"
          title="Expand & zoom"
          onClick={() => setExpanded(true)}
        >
          ⤢ Expand
        </button>
        <div className="mermaid-diagram" ref={ref} />
      </div>
      {expanded && <ZoomModal svg={svg} onClose={() => setExpanded(false)} />}
    </>
  );
}

function ZoomModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clamp = (s: number) => Math.min(8, Math.max(0.2, s));

  return (
    <div className="zoom-overlay" onClick={onClose}>
      <div className="zoom-toolbar" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setScale((s) => clamp(s * 1.25))}>＋</button>
        <button onClick={() => setScale((s) => clamp(s / 1.25))}>－</button>
        <button
          onClick={() => {
            setScale(1);
            setPos({ x: 0, y: 0 });
          }}
        >
          Reset
        </button>
        <span className="zoom-pct">{Math.round(scale * 100)}%</span>
        <button className="zoom-close" onClick={onClose}>
          ✕ Close
        </button>
      </div>
      <div
        className="zoom-stage"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => {
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
          setScale((s) => clamp(s * factor));
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({
            x: drag.current.ox + (e.clientX - drag.current.x),
            y: drag.current.oy + (e.clientY - drag.current.y),
          });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <div
          className="zoom-content"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div className="zoom-hint">scroll to zoom · drag to pan · Esc to close</div>
    </div>
  );
}
