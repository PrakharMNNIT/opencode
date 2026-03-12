import { describe, expect, test } from "bun:test"
import { memo } from "../src/util/memo"

describe("util.memo", () => {
  test("memoizes the result of the function", () => {
    let count = 0
    const fn = () => {
      count++
      return "value"
    }
    const memoized = memo(fn)

    expect(memoized()).toBe("value")
    expect(memoized()).toBe("value")
    expect(count).toBe(1)
  })

  test("resets the memoized value", async () => {
    let count = 0
    const fn = () => {
      count++
      return `value-${count}`
    }
    const memoized = memo(fn)

    expect(memoized()).toBe("value-1")
    await memoized.reset()
    expect(memoized()).toBe("value-2")
    expect(count).toBe(2)
  })

  test("calls cleanup on reset", async () => {
    let cleanupValue: string | undefined
    const fn = () => "original"
    const cleanup = async (val: string) => {
      cleanupValue = val
    }
    const memoized = memo(fn, cleanup)

    memoized()
    await memoized.reset()
    expect(cleanupValue).toBe("original")
  })

  test("does not call cleanup if not loaded", async () => {
    let cleaned = false
    const fn = () => "value"
    const cleanup = async () => {
      cleaned = true
    }
    const memoized = memo(fn, cleanup)

    await memoized.reset()
    expect(cleaned).toBe(false)
  })

  test("handles asynchronous cleanup", async () => {
    let cleaned = false
    const fn = () => "value"
    const cleanup = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      cleaned = true
    }
    const memoized = memo(fn, cleanup)

    memoized()
    await memoized.reset()
    expect(cleaned).toBe(true)
  })
})
