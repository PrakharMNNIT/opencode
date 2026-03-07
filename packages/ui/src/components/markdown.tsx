import { useMarked } from "../context/marked"
import { useI18n } from "../context/i18n"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import { checksum } from "@opencode-ai/util/encode"
import { ComponentProps, createEffect, createResource, createSignal, onCleanup, splitProps } from "solid-js"
import { isServer } from "solid-js/web"

type Entry = {
  hash: string
  html: string
}

const max = 200
const cache = new Map<string, Entry>()

if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (!(node instanceof HTMLAnchorElement)) return
    if (node.target !== "_blank") return

    const rel = node.getAttribute("rel") ?? ""
    const set = new Set(rel.split(/\s+/).filter(Boolean))
    set.add("noopener")
    set.add("noreferrer")
    node.setAttribute("rel", Array.from(set).join(" "))
  })
}

const config = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

const iconPaths = {
  copy: '<path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>',
  check: '<path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>',
  code: '<path d="M7 5L3 10L7 15" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 5L17 10L13 15" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>',
  diagram: '<path d="M3 3H17V17H3V3Z" stroke="currentColor" stroke-linecap="round"/><path d="M3 10H17" stroke="currentColor"/><path d="M10 3V17" stroke="currentColor"/>',
}

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, config)
}

function escape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function fallback(markdown: string) {
  return escape(markdown).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>")
}

type CopyLabels = {
  copy: string
  copied: string
}

const urlPattern = /^https?:\/\/[^\s<>()`"']+$/

function codeUrl(text: string) {
  const href = text.trim().replace(/[),.;!?]+$/, "")
  if (!urlPattern.test(href)) return
  try {
    const url = new URL(href)
    return url.toString()
  } catch {
    return
  }
}

function createIcon(path: string, slot: string) {
  const icon = document.createElement("div")
  icon.setAttribute("data-component", "icon")
  icon.setAttribute("data-size", "small")
  icon.setAttribute("data-slot", slot)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("data-slot", "icon-svg")
  svg.setAttribute("fill", "none")
  svg.setAttribute("viewBox", "0 0 20 20")
  svg.setAttribute("aria-hidden", "true")
  svg.innerHTML = path
  icon.appendChild(svg)
  return icon
}

function createCopyButton(labels: CopyLabels) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-component", "icon-button")
  button.setAttribute("data-variant", "secondary")
  button.setAttribute("data-size", "small")
  button.setAttribute("data-slot", "markdown-copy-button")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
  button.appendChild(createIcon(iconPaths.copy, "copy-icon"))
  button.appendChild(createIcon(iconPaths.check, "check-icon"))
  return button
}

function setCopyState(button: HTMLButtonElement, labels: CopyLabels, copied: boolean) {
  if (copied) {
    button.setAttribute("data-copied", "true")
    button.setAttribute("aria-label", labels.copied)
    button.setAttribute("data-tooltip", labels.copied)
    return
  }
  button.removeAttribute("data-copied")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
}

function ensureCodeWrapper(block: HTMLPreElement, labels: CopyLabels) {
  const parent = block.parentElement
  if (!parent) return
  const wrapped = parent.getAttribute("data-component") === "markdown-code"
  if (!wrapped) {
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "markdown-code")
    parent.replaceChild(wrapper, block)
    wrapper.appendChild(block)
    wrapper.appendChild(createCopyButton(labels))
    return
  }

  const buttons = Array.from(parent.querySelectorAll('[data-slot="markdown-copy-button"]')).filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement,
  )

  if (buttons.length === 0) {
    parent.appendChild(createCopyButton(labels))
    return
  }

  for (const button of buttons.slice(1)) {
    button.remove()
  }
}

function markCodeLinks(root: HTMLDivElement) {
  const codeNodes = Array.from(root.querySelectorAll(":not(pre) > code"))
  for (const code of codeNodes) {
    const href = codeUrl(code.textContent ?? "")
    const parentLink =
      code.parentElement instanceof HTMLAnchorElement && code.parentElement.classList.contains("external-link")
        ? code.parentElement
        : null

    if (!href) {
      if (parentLink) parentLink.replaceWith(code)
      continue
    }

    if (parentLink) {
      parentLink.href = href
      continue
    }

    const link = document.createElement("a")
    link.href = href
    link.className = "external-link"
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    code.parentNode?.replaceChild(link, code)
    link.appendChild(code)
  }
}

let mermaidLoadPromise: Promise<typeof import("mermaid")> | undefined
let lastThemeFingerprint = ""

function resolveColor(prop: string): string | undefined {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(prop).trim()
  if (!raw) return undefined
  // Resolve the CSS value to an rgb() string that mermaid can parse.
  // Values may be raw HSL channels (e.g. "217 91% 60%"), full hsl(), or named colors.
  const el = document.createElement("div")
  el.style.color = ""
  for (const candidate of [raw, `hsl(${raw})`]) {
    el.style.color = candidate
    if (el.style.color) break
  }
  if (!el.style.color) return undefined
  document.body.appendChild(el)
  const resolved = getComputedStyle(el).color
  el.remove()
  return resolved || undefined
}

function isDarkMode(): boolean {
  return document.documentElement.dataset.colorScheme === "dark" ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
}

function getMermaidThemeVars(): Record<string, string> {
  const vars: Record<string, string> = {}
  const dark = isDarkMode()
  // Separate mappings for dark and light mode.
  // Dark mode needs brighter tokens (scale indices 6-10) because
  // surface tokens (scale index 2) are nearly black and invisible.
  // Light mode uses subtle surface tokens which contrast well against white.
  const map: [string, string][] = dark
    ? [
        // ─── DARK MODE: use border/icon/text-level tokens for visible contrast ───
        // General
        ["primaryColor", "--border-interactive-base"],       // interactive[6] — visible blue
        ["primaryTextColor", "--text-strong"],                // near-white
        ["primaryBorderColor", "--text-interactive-base"],    // interactive[10] — bright blue
        ["lineColor", "--text-strong"],                       // near-white lines/arrows
        ["secondaryColor", "--border-info-base"],             // info[5] — visible purple
        ["tertiaryColor", "--border-success-base"],           // success[5] — visible green
        ["textColor", "--text-strong"],                       // near-white text
        ["mainBkg", "--surface-inset-base"],                  // dark bg (correct)
        ["nodeBorder", "--border-base"],                      // visible border
        ["nodeTextColor", "--text-strong"],                   // near-white
        // Flowchart
        ["clusterBkg", "--surface-base"],
        ["clusterBorder", "--border-base"],
        ["edgeLabelBackground", "--background-base"],
        ["defaultLinkColor", "--text-strong"],                // bright arrows
        // Sequence diagram
        ["actorBkg", "--surface-inset-base"],
        ["actorBorder", "--border-base"],
        ["actorTextColor", "--text-strong"],
        ["signalColor", "--text-strong"],                     // bright signal lines
        ["signalTextColor", "--text-strong"],
        ["activationBorderColor", "--text-interactive-base"], // bright blue
        ["activationBkgColor", "--border-interactive-base"],  // mid-tone blue
        ["sequenceNumberColor", "--text-strong"],
        ["labelBoxBkgColor", "--surface-inset-base"],
        ["labelBoxBorderColor", "--border-base"],
        ["labelTextColor", "--text-strong"],
        ["loopTextColor", "--text-strong"],
        // Notes
        ["noteBkgColor", "--surface-warning-base"],
        ["noteBorderColor", "--border-warning-base"],
        ["noteTextColor", "--text-strong"],
        // Class / State / ER
        ["classText", "--text-strong"],
        ["labelColor", "--text-strong"],
        ["altBackground", "--surface-base"],
        // Gantt
        ["sectionBkgColor", "--surface-base"],
        ["taskBkgColor", "--border-interactive-base"],        // visible blue fill
        ["taskTextColor", "--text-strong"],
        ["taskBorderColor", "--text-interactive-base"],       // bright blue
        ["gridColor", "--border-base"],
        ["todayLineColor", "--text-interactive-base"],
        // ER diagram
        ["fill0", "--border-interactive-base"],
        ["fill1", "--border-info-base"],
      ]
    : [
        // ─── LIGHT MODE: surface tokens are visible against white/light backgrounds ───
        // General
        ["primaryColor", "--surface-interactive-base"],       // interactive[2] — subtle blue
        ["primaryTextColor", "--text-strong"],                // near-black
        ["primaryBorderColor", "--border-interactive-base"],  // interactive[6] — mid blue
        ["lineColor", "--text-base"],                         // dark gray text
        ["secondaryColor", "--surface-info-base"],            // info[2] — subtle purple
        ["tertiaryColor", "--surface-success-base"],          // success[2] — subtle green
        ["textColor", "--text-base"],
        ["mainBkg", "--surface-inset-base"],
        ["nodeBorder", "--border-base"],
        ["nodeTextColor", "--text-strong"],
        // Flowchart
        ["clusterBkg", "--surface-base"],
        ["clusterBorder", "--border-weak-base"],
        ["edgeLabelBackground", "--background-base"],
        ["defaultLinkColor", "--text-base"],
        // Sequence diagram
        ["actorBkg", "--surface-inset-base"],
        ["actorBorder", "--border-base"],
        ["actorTextColor", "--text-strong"],
        ["signalColor", "--text-base"],
        ["signalTextColor", "--text-strong"],
        ["activationBorderColor", "--border-interactive-base"],
        ["activationBkgColor", "--surface-interactive-base"],
        ["sequenceNumberColor", "--text-on-interactive-base"],
        ["labelBoxBkgColor", "--surface-inset-base"],
        ["labelBoxBorderColor", "--border-base"],
        ["labelTextColor", "--text-base"],
        ["loopTextColor", "--text-base"],
        // Notes
        ["noteBkgColor", "--surface-warning-base"],
        ["noteBorderColor", "--border-warning-base"],
        ["noteTextColor", "--text-strong"],
        // Class / State / ER
        ["classText", "--text-strong"],
        ["labelColor", "--text-strong"],
        ["altBackground", "--surface-base"],
        // Gantt
        ["sectionBkgColor", "--surface-base"],
        ["taskBkgColor", "--surface-interactive-base"],
        ["taskTextColor", "--text-strong"],
        ["taskBorderColor", "--border-interactive-base"],
        ["gridColor", "--border-weak-base"],
        ["todayLineColor", "--border-interactive-base"],
        // ER diagram
        ["fill0", "--surface-interactive-base"],
        ["fill1", "--surface-info-base"],
      ]
  for (const [key, cssVar] of map) {
    const color = resolveColor(cssVar)
    if (color) vars[key] = color
  }
  return vars
}

function getThemeFingerprint(): string {
  const scheme = document.documentElement.dataset.colorScheme ?? "unknown"
  const themeId = document.documentElement.dataset.theme ?? "unknown"
  return `${themeId}:${scheme}`
}

function configureMermaid(m: typeof import("mermaid")) {
  const dark = isDarkMode()
  const themeVars = getMermaidThemeVars()
  const hasCustomColors = Object.keys(themeVars).length > 0
  m.default.initialize({
    startOnLoad: false,
    theme: hasCustomColors ? "base" : (dark ? "dark" : "default"),
    ...(hasCustomColors && { themeVariables: { darkMode: dark, ...themeVars } }),
  })
  lastThemeFingerprint = getThemeFingerprint()
}

async function getMermaid() {
  if (!mermaidLoadPromise) {
    mermaidLoadPromise = import("mermaid")
      .then((m) => {
        configureMermaid(m)
        return m
      })
      .catch((err) => {
        mermaidLoadPromise = undefined
        throw err
      })
  }
  const m = await mermaidLoadPromise
  // Re-initialize if theme changed since last configure
  const currentFp = getThemeFingerprint()
  if (currentFp !== lastThemeFingerprint) {
    configureMermaid(m)
  }
  return m
}

let mermaidCounter = 0

const mermaidKeywords =
  /^(?:graph\s|flowchart\s|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|mindmap|timeline|quadrantChart|sankey|xychart|block-beta|packet-beta)/

function upgradeBareCodeBlocks(root: HTMLDivElement) {
  // Find bare mermaid code blocks from cached HTML that predate the placeholder system.
  // Check both explicit language-mermaid classes AND content-based heuristics
  // (Shiki renders unknown langs as "text" so there's no class to match).
  const preEls = Array.from(root.querySelectorAll("pre"))
  for (const pre of preEls) {
    if (pre.closest('[data-component="mermaid-diagram"]')) continue

    const code = pre.querySelector("code")
    if (!code) continue

    const hasMermaidClass = code.className.includes("language-mermaid")
    const source = (code.textContent ?? "").trim()
    if (!source) continue

    if (!hasMermaidClass && !mermaidKeywords.test(source)) continue

    const encoded = btoa(unescape(encodeURIComponent(source)))
    const container = document.createElement("div")
    container.setAttribute("data-component", "mermaid-diagram")
    container.setAttribute("data-mermaid", encoded)

    const renderSlot = document.createElement("div")
    renderSlot.setAttribute("data-slot", "mermaid-render")
    renderSlot.innerHTML = '<div data-slot="mermaid-loading">Loading diagram\u2026</div>'

    const sourceSlot = document.createElement("div")
    sourceSlot.setAttribute("data-slot", "mermaid-source")
    sourceSlot.hidden = true
    const clonedPre = pre.cloneNode(true) as HTMLPreElement
    sourceSlot.appendChild(clonedPre)

    container.appendChild(renderSlot)
    container.appendChild(sourceSlot)

    const wrapper = pre.closest('[data-component="markdown-code"]')
    const target = wrapper ?? pre
    target.parentNode?.replaceChild(container, target)
  }
}

async function renderMermaidDiagrams(root: HTMLDivElement) {
  // First, upgrade any bare mermaid code blocks from cached content
  upgradeBareCodeBlocks(root)

  const diagrams = Array.from(root.querySelectorAll<HTMLElement>('[data-component="mermaid-diagram"]'))
  if (diagrams.length === 0) return

  const pending = diagrams.filter((d) => !d.hasAttribute("data-rendered"))
  if (pending.length === 0) return

  const mermaid = await getMermaid()

  for (const container of pending) {
    const encoded = container.getAttribute("data-mermaid")
    if (!encoded) continue

    const renderSlot = container.querySelector<HTMLElement>('[data-slot="mermaid-render"]')
    if (!renderSlot) continue

    let source: string
    try {
      source = decodeURIComponent(escape(atob(encoded)))
    } catch {
      continue
    }

    try {
      const id = `mermaid-${++mermaidCounter}`
      const { svg } = await mermaid.default.render(id, source)
      renderSlot.innerHTML = svg
      container.setAttribute("data-rendered", "true")

      // Add action buttons if not already present
      if (!container.querySelector('[data-slot="mermaid-actions"]')) {
        const actions = document.createElement("div")
        actions.setAttribute("data-slot", "mermaid-actions")

        const copyBtn = document.createElement("button")
        copyBtn.type = "button"
        copyBtn.setAttribute("data-component", "icon-button")
        copyBtn.setAttribute("data-variant", "secondary")
        copyBtn.setAttribute("data-size", "small")
        copyBtn.setAttribute("data-slot", "mermaid-copy")
        copyBtn.setAttribute("aria-label", "Copy source")
        copyBtn.setAttribute("data-tooltip", "Copy source")
        copyBtn.appendChild(createIcon(iconPaths.copy, "copy-icon"))
        copyBtn.appendChild(createIcon(iconPaths.check, "check-icon"))
        actions.appendChild(copyBtn)

        const toggle = document.createElement("button")
        toggle.type = "button"
        toggle.setAttribute("data-component", "icon-button")
        toggle.setAttribute("data-variant", "secondary")
        toggle.setAttribute("data-size", "small")
        toggle.setAttribute("data-slot", "mermaid-toggle")
        toggle.setAttribute("data-view", "diagram")
        toggle.setAttribute("aria-label", "View source")
        toggle.setAttribute("data-tooltip", "View source")
        toggle.appendChild(createIcon(iconPaths.code, "toggle-code-icon"))
        toggle.appendChild(createIcon(iconPaths.diagram, "toggle-diagram-icon"))
        actions.appendChild(toggle)

        container.appendChild(actions)
      }
    } catch {
      // Render failed — show source as fallback
      const sourceSlot = container.querySelector<HTMLElement>('[data-slot="mermaid-source"]')
      if (renderSlot && sourceSlot) {
        renderSlot.hidden = true
        sourceSlot.hidden = false
      }
      container.setAttribute("data-rendered", "error")
    }
  }
}

function setupMermaidToggle(root: HTMLDivElement) {
  const copyTimeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()

  const handleClick = async (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    // Handle copy button
    const copyBtn = target.closest('[data-slot="mermaid-copy"]')
    if (copyBtn instanceof HTMLButtonElement) {
      const container = copyBtn.closest('[data-component="mermaid-diagram"]')
      const encoded = container?.getAttribute("data-mermaid")
      if (!encoded) return
      let source: string
      try {
        source = decodeURIComponent(escape(atob(encoded)))
      } catch {
        return
      }
      await navigator.clipboard?.writeText(source)
      copyBtn.setAttribute("data-copied", "true")
      copyBtn.setAttribute("data-tooltip", "Copied!")
      const existing = copyTimeouts.get(copyBtn)
      if (existing) clearTimeout(existing)
      copyTimeouts.set(copyBtn, setTimeout(() => {
        copyBtn.removeAttribute("data-copied")
        copyBtn.setAttribute("data-tooltip", "Copy source")
      }, 2000))
      return
    }

    // Handle toggle button
    const toggle = target.closest('[data-slot="mermaid-toggle"]')
    if (!(toggle instanceof HTMLButtonElement)) return

    const container = toggle.closest('[data-component="mermaid-diagram"]')
    if (!container) return

    const renderSlot = container.querySelector<HTMLElement>('[data-slot="mermaid-render"]')
    const sourceSlot = container.querySelector<HTMLElement>('[data-slot="mermaid-source"]')
    if (!renderSlot || !sourceSlot) return

    const showingDiagram = toggle.getAttribute("data-view") === "diagram"
    if (showingDiagram) {
      renderSlot.hidden = true
      sourceSlot.hidden = false
      toggle.setAttribute("data-view", "source")
      toggle.setAttribute("aria-label", "View diagram")
      toggle.setAttribute("data-tooltip", "View diagram")
    } else {
      renderSlot.hidden = false
      sourceSlot.hidden = true
      toggle.setAttribute("data-view", "diagram")
      toggle.setAttribute("aria-label", "View source")
      toggle.setAttribute("data-tooltip", "View source")
    }
  }

  root.addEventListener("click", handleClick)
  return () => {
    root.removeEventListener("click", handleClick)
    for (const t of copyTimeouts.values()) clearTimeout(t)
  }
}

// Re-render all mermaid diagrams in a container (used on theme change)
async function rerenderMermaidDiagrams(root: HTMLDivElement) {
  const rendered = Array.from(root.querySelectorAll<HTMLElement>('[data-component="mermaid-diagram"][data-rendered="true"]'))
  if (rendered.length === 0) return
  const mermaid = await getMermaid()
  for (const container of rendered) {
    const encoded = container.getAttribute("data-mermaid")
    if (!encoded) continue
    const renderSlot = container.querySelector<HTMLElement>('[data-slot="mermaid-render"]')
    if (!renderSlot) continue
    let source: string
    try {
      source = decodeURIComponent(escape(atob(encoded)))
    } catch {
      continue
    }
    try {
      const id = `mermaid-${++mermaidCounter}`
      const { svg } = await mermaid.default.render(id, source)
      renderSlot.innerHTML = svg
    } catch {
      // Keep existing render on error
    }
  }
}

function setupMermaidThemeObserver(root: HTMLDivElement) {
  let lastFp = getThemeFingerprint()
  const observer = new MutationObserver(() => {
    const currentFp = getThemeFingerprint()
    if (currentFp === lastFp) return
    lastFp = currentFp
    rerenderMermaidDiagrams(root)
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-color-scheme", "data-theme"],
  })
  return () => observer.disconnect()
}

function decorate(root: HTMLDivElement, labels: CopyLabels) {
  const blocks = Array.from(root.querySelectorAll("pre"))
  for (const block of blocks) {
    // Skip pre elements inside mermaid source slots
    if (block.closest('[data-slot="mermaid-source"]')) continue
    ensureCodeWrapper(block, labels)
  }
  markCodeLinks(root)
}

function setupCodeCopy(root: HTMLDivElement, labels: CopyLabels) {
  const timeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()

  const updateLabel = (button: HTMLButtonElement) => {
    const copied = button.getAttribute("data-copied") === "true"
    setCopyState(button, labels, copied)
  }

  const handleClick = async (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest('[data-slot="markdown-copy-button"]')
    if (!(button instanceof HTMLButtonElement)) return
    const code = button.closest('[data-component="markdown-code"]')?.querySelector("code")
    const content = code?.textContent ?? ""
    if (!content) return
    const clipboard = navigator?.clipboard
    if (!clipboard) return
    await clipboard.writeText(content)
    setCopyState(button, labels, true)
    const existing = timeouts.get(button)
    if (existing) clearTimeout(existing)
    const timeout = setTimeout(() => setCopyState(button, labels, false), 2000)
    timeouts.set(button, timeout)
  }

  decorate(root, labels)

  const buttons = Array.from(root.querySelectorAll('[data-slot="markdown-copy-button"]'))
  for (const button of buttons) {
    if (button instanceof HTMLButtonElement) updateLabel(button)
  }

  root.addEventListener("click", handleClick)

  return () => {
    root.removeEventListener("click", handleClick)
    for (const timeout of timeouts.values()) {
      clearTimeout(timeout)
    }
  }
}

function touch(key: string, value: Entry) {
  cache.delete(key)
  cache.set(key, value)

  if (cache.size <= max) return

  const first = cache.keys().next().value
  if (!first) return
  cache.delete(first)
}

export function Markdown(
  props: ComponentProps<"div"> & {
    text: string
    cacheKey?: string
    class?: string
    classList?: Record<string, boolean>
  },
) {
  const [local, others] = splitProps(props, ["text", "cacheKey", "class", "classList"])
  const marked = useMarked()
  const i18n = useI18n()
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const [html] = createResource(
    () => local.text,
    async (markdown) => {
      if (isServer) return fallback(markdown)

      const hash = checksum(markdown)
      const key = local.cacheKey ?? hash

      if (key && hash) {
        const cached = cache.get(key)
        if (cached && cached.hash === hash) {
          touch(key, cached)
          return cached.html
        }
      }

      const next = await marked.parse(markdown)
      const safe = sanitize(next)
      if (key && hash) touch(key, { hash, html: safe })
      return safe
    },
    { initialValue: isServer ? fallback(local.text) : "" },
  )

  let copySetupTimer: ReturnType<typeof setTimeout> | undefined
  let copyCleanup: (() => void) | undefined
  let mermaidToggleCleanup: (() => void) | undefined
  let mermaidThemeCleanup: (() => void) | undefined

  createEffect(() => {
    const container = root()
    const content = html()
    if (!container) return
    if (isServer) return

    if (!content) {
      container.innerHTML = ""
      return
    }

    const temp = document.createElement("div")
    temp.innerHTML = content
    decorate(temp, {
      copy: i18n.t("ui.message.copy"),
      copied: i18n.t("ui.message.copied"),
    })

    morphdom(container, temp, {
      childrenOnly: true,
      onBeforeElUpdated: (fromEl, toEl) => {
        // Preserve already-rendered mermaid diagrams
        if (
          fromEl instanceof HTMLElement &&
          fromEl.getAttribute("data-rendered") === "true" &&
          toEl instanceof HTMLElement &&
          fromEl.getAttribute("data-mermaid") === toEl.getAttribute("data-mermaid")
        ) {
          return false
        }
        if (fromEl.isEqualNode(toEl)) return false
        return true
      },
    })

    if (copySetupTimer) clearTimeout(copySetupTimer)
    copySetupTimer = setTimeout(() => {
      if (copyCleanup) copyCleanup()
      copyCleanup = setupCodeCopy(container, {
        copy: i18n.t("ui.message.copy"),
        copied: i18n.t("ui.message.copied"),
      })

      if (!mermaidToggleCleanup) {
        mermaidToggleCleanup = setupMermaidToggle(container)
      }
      if (!mermaidThemeCleanup) {
        mermaidThemeCleanup = setupMermaidThemeObserver(container)
      }

      renderMermaidDiagrams(container)
    }, 150)
  })

  onCleanup(() => {
    if (copySetupTimer) clearTimeout(copySetupTimer)
    if (copyCleanup) copyCleanup()
    if (mermaidToggleCleanup) mermaidToggleCleanup()
    if (mermaidThemeCleanup) mermaidThemeCleanup()
  })

  return (
    <div
      data-component="markdown"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
      ref={setRoot}
      {...others}
    />
  )
}
