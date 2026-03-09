import { commands } from "./bindings"

const native = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

function forward(level: string, args: unknown[]) {
  const msg = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
    .join(" ")
  commands.logWebview(level, msg).catch(() => {})
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
