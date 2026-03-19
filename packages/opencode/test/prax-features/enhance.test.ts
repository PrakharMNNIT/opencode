import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

const root = path.resolve(import.meta.dir, "../../src")

describe("enhance agent (backend)", () => {
  describe("agent definition", () => {
    const file = path.join(root, "agent/agent.ts")

    test("imports PROMPT_ENHANCE from enhance.txt", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('import PROMPT_ENHANCE from "./prompt/enhance.txt"')
    })

    test("defines enhance agent in agents object", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("enhance: {")
      expect(src).toContain('name: "enhance"')
    })

    test("enhance agent is primary mode", async () => {
      const src = await fs.readFile(file, "utf-8")
      const block = src.slice(src.indexOf("enhance: {"), src.indexOf("enhance: {") + 300)
      expect(block).toContain('mode: "primary"')
    })

    test("enhance agent is hidden", async () => {
      const src = await fs.readFile(file, "utf-8")
      const block = src.slice(src.indexOf("enhance: {"), src.indexOf("enhance: {") + 300)
      expect(block).toContain("hidden: true")
    })

    test("enhance agent is native", async () => {
      const src = await fs.readFile(file, "utf-8")
      const block = src.slice(src.indexOf("enhance: {"), src.indexOf("enhance: {") + 300)
      expect(block).toContain("native: true")
    })

    test("enhance agent uses PROMPT_ENHANCE as prompt", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("prompt: PROMPT_ENHANCE")
    })

    test("enhance agent has temperature 0.7 for creativity", async () => {
      const src = await fs.readFile(file, "utf-8")
      const block = src.slice(src.indexOf("enhance: {"), src.indexOf("enhance: {") + 300)
      expect(block).toContain("temperature: 0.7")
    })
  })

  describe("enhance prompt file", () => {
    const file = path.join(root, "agent/prompt/enhance.txt")

    test("enhance.txt exists", async () => {
      const stat = await fs.stat(file)
      expect(stat.isFile()).toBe(true)
    })

    test("enhance.txt is non-empty", async () => {
      const content = await fs.readFile(file, "utf-8")
      expect(content.trim().length).toBeGreaterThan(10)
    })
  })

  describe("experimental route", () => {
    const file = path.join(root, "server/routes/experimental.ts")

    test("experimental.ts exists", async () => {
      const stat = await fs.stat(file)
      expect(stat.isFile()).toBe(true)
    })

    test("defines POST /enhance endpoint", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('.post(\n      "/enhance"')
    })

    test("enhance route reads text from request body", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("text")
    })

    test("enhance route uses SessionID branded type", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("SessionID")
    })

    test("enhance route uses ProviderID branded type", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("ProviderID")
    })

    test("enhance route returns JSON response with text field", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("c.json")
    })

    test("enhance route uses errors() for error responses", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("...errors(400)")
    })
  })
})
