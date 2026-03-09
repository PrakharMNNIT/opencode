import { commands } from "./bindings"

const native = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

// Batch IPC calls to avoid flooding Rust tracing on high-volume output
// (mermaid/cytoscape can emit 50+ warnings per diagram render)
let batch: string[] = []
let timer: ReturnType<typeof setTimeout> | undefined

function flush() {
  if (batch.length === 0) return
  const msg = batch.join("\n")
  batch = []
  commands.logWebview("info", msg).catch(() => {})
}

function queue(level: string, msg: string) {
  batch.push(`[${level}] ${msg}`)
  if (!timer) timer = setTimeout(() => { timer = undefined; flush() }, 100)
}

// Skip known noisy warnings that provide no diagnostic value
const noisy = /Do not assign mappings to elements without corresponding data/

function forward(level: string, args: unknown[]) {
  const msg = args
    .map((a) => {
      if (typeof a === "string") return a
      try { return JSON.stringify(a, null, 2) } catch { return String(a) }
    })
    .join(" ")
  if (noisy.test(msg)) return
  if (level === "error") {
    // Errors go immediately, not batched
    commands.logWebview("error", msg).catch(() => {})
    return
  }
  queue(level, msg)
}

console.log = (...args: unknown[]) => {
  native.log(...args)
  forward("info", args)
}

console.info = (...args: unknown[]) => {
  native.info(...args)
  forward("info", args)
}

console.warn = (...args: unknown[]) => {
  native.warn(...args)
  forward("warn", args)
}

console.error = (...args: unknown[]) => {
  native.error(...args)
  forward("error", args)
}

console.debug = (...args: unknown[]) => {
  native.debug(...args)
  forward("debug", args)
}

window.addEventListener("error", (e) => {
  forward("error", [`[uncaught] ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`])
})

window.addEventListener("unhandledrejection", (e) => {
  forward("error", [`[unhandled-rejection] ${e.reason}`])
})
