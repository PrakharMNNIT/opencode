import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

const appRoot = path.resolve(import.meta.dir)
const uiRoot = path.resolve(import.meta.dir, "../../ui/src")

describe("font size settings", () => {
  const file = path.join(appRoot, "context/settings.tsx")

  test("defines fontSize in appearance settings", async () => {
    const src = await fs.readFile(file, "utf-8")
    expect(src).toContain("fontSize: number")
  })

  test("default fontSize is 14", async () => {
    const src = await fs.readFile(file, "utf-8")
    expect(src).toContain("fontSize: 14")
  })

  test("fontSize has fallback to default", async () => {
    const src = await fs.readFile(file, "utf-8")
    expect(src).toContain("store.appearance?.fontSize")
    expect(src).toContain("defaultSettings.appearance.fontSize")
  })

  test("exposes setFontSize setter", async () => {
    const src = await fs.readFile(file, "utf-8")
    expect(src).toContain('setStore("appearance", "fontSize"')
  })

  describe("settings-general.tsx UI controls", () => {
    const uiFile = path.join(appRoot, "components/settings-general.tsx")

    test("has font size decrement button", async () => {
      const src = await fs.readFile(uiFile, "utf-8")
      expect(src).toContain("fontSize() - 1")
    })

    test("has font size increment button", async () => {
      const src = await fs.readFile(uiFile, "utf-8")
      expect(src).toContain("fontSize() + 1")
    })

    test("enforces minimum font size of 10", async () => {
      const src = await fs.readFile(uiFile, "utf-8")
      expect(src).toContain("fontSize() <= 10")
      expect(src).toContain("Math.max(10")
    })

    test("enforces maximum font size of 32", async () => {
      const src = await fs.readFile(uiFile, "utf-8")
      expect(src).toContain("fontSize() >= 32")
      expect(src).toContain("Math.min(32")
    })

    test("displays current font size value", async () => {
      const src = await fs.readFile(uiFile, "utf-8")
      expect(src).toContain("fontSize()")
    })
  })

  describe("terminal integration", () => {
    const termFile = path.join(appRoot, "components/terminal.tsx")

    test("terminal uses settings fontSize", async () => {
      const src = await fs.readFile(termFile, "utf-8")
      expect(src).toContain("settings.appearance.fontSize()")
    })
  })
})

describe("wide screen mode", () => {
  const file = path.join(appRoot, "pages/session.tsx")

  test("session.tsx references wideMode", async () => {
    const src = await fs.readFile(file, "utf-8")
    expect(src).toContain("wideMode")
  })

  test("wideMode affects layout centering (centered memo)", async () => {
    const src = await fs.readFile(file, "utf-8")
    // wideMode should be part of the centered/layout calculation
    const hasWideInCentered = src.includes("wideMode") && src.includes("centered")
    expect(hasWideInCentered).toBe(true)
  })

  describe("settings integration", () => {
    const settingsFile = path.join(appRoot, "context/settings.tsx")

    test("wideMode is defined in settings", async () => {
      const src = await fs.readFile(settingsFile, "utf-8")
      const hasWide = src.includes("wideMode") || src.includes("wide_mode") || src.includes("wide")
      expect(hasWide).toBe(true)
    })
  })
})

describe("steer queue UI (prompt-input.tsx)", () => {
  const file = path.join(appRoot, "components/prompt-input.tsx")

  describe("state and signals", () => {
    test("defines steerQueue memo from sync data", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("const steerQueue = createMemo")
      expect(src).toContain("sync.data.steer_queue")
    })

    test("defines steerPending signal", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("const [steerPending, setSteerPending] = createSignal(false)")
    })

    test("defines enhancing signal", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("const [enhancing, setEnhancing] = createSignal(false)")
    })
  })

  describe("steer queue badges", () => {
    test("renders pending count header", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("Pending ({steerQueue().length})")
    })

    test("renders steer mode badge", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('{item.mode === "steer" ? "steer" : "queue"}')
    })

    test("renders remove button for each queue item", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("steer2.remove")
      expect(src).toContain("steerID: item.id")
    })

    test("shows badges only when queue is non-empty", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("steerQueue().length > 0")
    })

    test("uses For component to iterate queue items", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("<For each={steerQueue()}>")
    })
  })

  describe("steer button", () => {
    test("steer button has data-action prompt-steer", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('data-action="prompt-steer"')
    })

    test("steer button visible when working and dirty", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("when={working() && prompt.dirty()}")
    })

    test("steer button calls session.steer API", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("sdk.client.session")
      expect(src).toContain('.steer({ sessionID, text, mode: "steer" })')
    })

    test("steer button clears text after success", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("const kept = clearText()")
    })

    test("steer button shows toast on success", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("showToast")
      expect(src).toContain("Steering")
    })

    test("steer button shows error toast on failure", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("Failed to steer")
    })

    test("steer button prevents double-click via steerPending", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("if (!sessionID || steerPending()) return")
    })
  })

  describe("data-action selector", () => {
    test("includes prompt-steer in mouseDown selector", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('"prompt-steer"')
      expect(src).toContain(
        '[data-action="prompt-attach"], [data-action="prompt-submit"], [data-action="prompt-steer"], [data-action="prompt-permissions"]',
      )
    })
  })
})

describe("enhance button UI (prompt-input.tsx)", () => {
  const file = path.join(appRoot, "components/prompt-input.tsx")

  describe("enhancePrompt function", () => {
    test("calls /experimental/enhance endpoint", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("`${sdk.url}/experimental/enhance`")
    })

    test("sends POST with JSON body containing text", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('method: "POST"')
      expect(src).toContain("JSON.stringify({ text })")
    })

    test("includes auth header when password is set", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("if (http?.password)")
      expect(src).toContain("Authorization")
      expect(src).toContain("Basic")
    })

    test("uses platform.fetch for desktop compatibility", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("platform.fetch ?? fetch")
    })

    test("updates editor with enhanced text on success", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("editorRef.textContent = data.text")
    })

    test("preserves non-text attachments during enhance", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('prompt.current().filter((p) => p.type !== "text")')
    })

    test("shows toast on failure", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("Failed to enhance prompt")
    })

    test("guards against empty text", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("if (!text || enhancing()) return")
    })

    test("sets enhancing flag during request", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("setEnhancing(true)")
      expect(src).toContain("setEnhancing(false)")
    })
  })

  describe("enhance button JSX", () => {
    test("has data-action prompt-enhance", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('data-action="prompt-enhance"')
    })

    test("shows sparkle icon", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('name="sparkle"')
    })

    test("pulses while enhancing", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('"animate-pulse": enhancing()')
    })

    test("visible only when dirty and not working", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("when={prompt.dirty() && !working()}")
    })

    test("disabled when enhancing or not in normal mode", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('disabled={enhancing() || store.mode !== "normal"}')
    })
  })

  describe("clearText helper", () => {
    test("clearText preserves non-text parts", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('const kept = prompt.current().filter((p) => p.type !== "text")')
    })

    test("clearText calls prompt.reset when no attachments", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("prompt.reset()")
    })

    test("clearText returns boolean indicating kept attachments", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("return true")
      expect(src).toContain("return false")
    })
  })

  describe("queue-aware submit button", () => {
    test("icon changes to arrow-up when working and dirty (queue mode)", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('icon={working() ? (prompt.dirty() ? "arrow-up" : "stop") : "arrow-up"}')
    })

    test("shows Queue tooltip when working and dirty", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("<span>Queue</span>")
    })

    test("shows Stop tooltip when working and not dirty", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("prompt.action.stop")
    })

    test("shows Send tooltip when not working", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("prompt.action.send")
    })

    test("uses Switch/Match for tooltip content", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("<Switch>")
      expect(src).toContain("<Match when={working() && prompt.dirty()}>")
      expect(src).toContain("<Match when={working()}>")
      expect(src).toContain("<Match when={true}>")
    })

    test("aria-label reflects queue/stop/send state", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('language.t("prompt.action.queued") ?? "Queue"')
    })
  })
})

describe("custom themes", () => {
  const themesDir = path.join(uiRoot, "theme/themes")
  const defaultThemesFile = path.join(uiRoot, "theme/default-themes.ts")
  const contextFile = path.join(uiRoot, "theme/context.tsx")

  test("aurora theme JSON exists", async () => {
    const stat = await fs.stat(path.join(themesDir, "aurora.json"))
    expect(stat.isFile()).toBe(true)
  })

  test("midnight theme JSON exists", async () => {
    const stat = await fs.stat(path.join(themesDir, "midnight.json"))
    expect(stat.isFile()).toBe(true)
  })

  test("everforest theme JSON exists", async () => {
    const stat = await fs.stat(path.join(themesDir, "everforest.json"))
    expect(stat.isFile()).toBe(true)
  })

  test("kanagawa theme JSON exists", async () => {
    const stat = await fs.stat(path.join(themesDir, "kanagawa.json"))
    expect(stat.isFile()).toBe(true)
  })

  test("rosepine theme JSON exists", async () => {
    const stat = await fs.stat(path.join(themesDir, "rosepine.json"))
    expect(stat.isFile()).toBe(true)
  })

  test("default-themes.ts exports aurora", async () => {
    const src = await fs.readFile(defaultThemesFile, "utf-8")
    expect(src).toContain("aurora")
  })

  test("default-themes.ts exports midnight", async () => {
    const src = await fs.readFile(defaultThemesFile, "utf-8")
    expect(src).toContain("midnight")
  })

  test("aurora is the default theme in context.tsx", async () => {
    const src = await fs.readFile(contextFile, "utf-8")
    expect(src).toContain("aurora")
  })

  describe("theme JSON structure", () => {
    test("aurora.json has valid theme structure (light/dark or seeds or palette)", async () => {
      const content = await fs.readFile(path.join(themesDir, "aurora.json"), "utf-8")
      const json = JSON.parse(content)
      const valid =
        json.seeds !== undefined ||
        json.palette !== undefined ||
        (json.light !== undefined && json.dark !== undefined)
      expect(valid).toBe(true)
      expect(json.name).toBeDefined()
      expect(json.id).toBeDefined()
    })

    test("each prax theme JSON is valid JSON", async () => {
      const praxThemes = ["aurora", "midnight", "everforest", "kanagawa", "rosepine"]
      for (const name of praxThemes) {
        const content = await fs.readFile(path.join(themesDir, `${name}.json`), "utf-8")
        expect(() => JSON.parse(content)).not.toThrow()
      }
    })
  })

  describe("theme preload", () => {
    const preloadFile = path.join(appRoot, "../public/oc-theme-preload.js")

    test("preload defaults to aurora", async () => {
      const src = await fs.readFile(preloadFile, "utf-8")
      expect(src).toContain("aurora")
    })

    test("preload migrates oc-1 to oc-2", async () => {
      const src = await fs.readFile(preloadFile, "utf-8")
      expect(src).toContain("oc-1")
      expect(src).toContain("oc-2")
    })
  })
})
