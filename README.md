# MD Visualizer

A small, universal Markdown viewer. Drop in **any** `.md` file and read it as a clean document — styled tables, rendered [Mermaid](https://mermaid.js.org/) diagrams, and an auto-generated table of contents. Everything runs in the browser; nothing is uploaded to a server.

## Features

- 📂 Drag-and-drop or browse for any `.md` / `.markdown` / `.mdx` / `.txt` file
- 📊 GitHub-flavored Markdown tables, rendered cleanly with horizontal scroll
- 🧜 ` ```mermaid ` code blocks drawn automatically as diagrams
- 🧭 Live table of contents built from headings
- 🔒 100% client-side — your file never leaves your machine

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build      # output in dist/
npm run preview
```

## Deploy

Static SPA — deploys to Vercel (or any static host) with zero config.

## Stack

Vite · React · TypeScript · react-markdown · remark-gfm · mermaid
