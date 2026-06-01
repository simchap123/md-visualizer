import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "inherit",
});

/** Renders a Mermaid code block as an SVG diagram, falling back to source on error. */
export function Mermaid({ chart }: { chart: string }) {
  const reactId = useId();
  const id = "m" + reactId.replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

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

  return <div className="mermaid-diagram" ref={ref} />;
}
