import { createStore } from "solid-js/store"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { useKeyboard, useTerminalDimensions, type JSX } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { useSDK } from "../../context/sdk"
import { SplitBorder } from "../../component/border"
import { useSync } from "../../context/sync"
import path from "path"
import { LANGUAGE_EXTENSIONS } from "@/lsp/language"

function normalizePath(input?: string) {
  if (!input) return ""
  if (path.isAbsolute(input)) {
    return path.relative(process.cwd(), input) || "."
  }
  return input
}

function filetype(input?: string) {
  if (!input) return "none"
  const ext = path.extname(input)
  const language = LANGUAGE_EXTENSIONS[ext]
  if (["typescriptreact", "javascriptreact", "javascript"].includes(language)) return "typescript"
  return language
}

function EditBody(props: { request: PermissionRequest }) {
  const { theme, syntax } = useTheme()
  const sync = useSync()
  const dimensions = useTerminalDimensions()

  const metadata = props.request.metadata as { filepath?: string; diff?: string }
  const filepath = createMemo(() => metadata.filepath ?? "")
  const diff = createMemo(() => metadata.diff ?? "")

  const view = createMemo(() => {
    const diffStyle = sync.data.config.tui?.diff_style
    if (diffStyle === "stacked") return "unified"
    return dimensions().width > 120 ? "split" : "unified"
  })

  const ft = createMemo(() => filetype(filepath()))

  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="row" gap={1}>
        <text fg={theme.textMuted}>{"→"}</text>
        <text fg={theme.textMuted}>Edit {normalizePath(filepath())}</text>
      </box>
      <Show when={diff()}>
        <box>
          <diff
            diff={diff()}
            view={view()}
            filetype={ft()}
            syntaxStyle={syntax()}
            showLineNumbers={true}
            width="100%"
            wrapMode="word"
            fg={theme.text}
            addedBg={theme.diffAddedBg}
            removedBg={theme.diffRemovedBg}
            contextBg={theme.diffContextBg}
            addedSignColor={theme.diffHighlightAdded}
            removedSignColor={theme.diffHighlightRemoved}
            lineNumberFg={theme.diffLineNumber}
            lineNumberBg={theme.diffContextBg}
            addedLineNumberBg={theme.diffAddedLineNumberBg}
            removedLineNumberBg={theme.diffRemovedLineNumberBg}
          />
        </box>
      </Show>
    </box>
  )
}

function TextBody(props: { text: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" gap={1}>
      <text fg={theme.textMuted} flexShrink={0}>
        {"→"}
      </text>
      <text fg={theme.textMuted}>{props.text}</text>
    </box>
  )
}

export function PermissionPrompt(props: { request: PermissionRequest }) {
  const sdk = useSDK()
  const [store, setStore] = createStore({
    always: false,
  })

  const metadata = props.request.metadata as { filepath?: string }

  return (
    <Switch>
      <Match when={store.always}>
        <Prompt
          title="Always allow"
          body={<TextBody text={props.request.always.join("\n")} />}
          options={{ confirm: "Confirm", cancel: "Cancel" }}
          onSelect={(option) => {
            if (option === "cancel") {
              setStore("always", false)
              return
            }
            sdk.client.permission.reply({
              reply: "always",
              requestID: props.request.id,
            })
          }}
        />
      </Match>
      <Match when={props.request.permission === "edit" && !store.always}>
        <Prompt
          title="Permission required"
          body={<EditBody request={props.request} />}
          options={{ once: "Allow once", always: "Allow always", reject: "Reject" }}
          onSelect={(option) => {
            if (option === "always") {
              setStore("always", true)
              return
            }
            sdk.client.permission.reply({
              reply: option as "once" | "reject",
              requestID: props.request.id,
            })
          }}
        />
      </Match>
      <Match when={!store.always}>
        <Prompt
          title="Permission required"
          body={<TextBody text={props.request.message} />}
          options={{ once: "Allow once", always: "Allow always", reject: "Reject" }}
          onSelect={(option) => {
            if (option === "always") {
              setStore("always", true)
              return
            }
            sdk.client.permission.reply({
              reply: option as "once" | "reject",
              requestID: props.request.id,
            })
          }}
        />
      </Match>
    </Switch>
  )
}

function Prompt<const T extends Record<string, string>>(props: {
  title: string
  body: JSX.Element
  options: T
  onSelect: (option: keyof T) => void
}) {
  const { theme } = useTheme()
  const keys = Object.keys(props.options) as (keyof T)[]
  const [store, setStore] = createStore({
    selected: keys[0],
  })

  useKeyboard((evt) => {
    if (evt.name === "left" || evt.name == "h") {
      evt.preventDefault()
      const idx = keys.indexOf(store.selected)
      const next = keys[(idx - 1 + keys.length) % keys.length]
      setStore("selected", next)
    }

    if (evt.name === "right" || evt.name == "l") {
      evt.preventDefault()
      const idx = keys.indexOf(store.selected)
      const next = keys[(idx + 1) % keys.length]
      setStore("selected", next)
    }

    if (evt.name === "return") {
      evt.preventDefault()
      props.onSelect(store.selected)
    }
  })

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      border={["left"]}
      borderColor={theme.warning}
      customBorderChars={SplitBorder.customBorderChars}
    >
      <box gap={1} paddingLeft={2} paddingRight={3} paddingTop={1} paddingBottom={1}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.warning}>{"△"}</text>
          <text fg={theme.text}>{props.title}</text>
        </box>
        {props.body}
      </box>
      <box
        flexDirection="row"
        gap={1}
        paddingLeft={2}
        paddingRight={3}
        paddingBottom={1}
        backgroundColor={theme.backgroundElement}
        justifyContent="space-between"
      >
        <box flexDirection="row" gap={1}>
          <For each={keys}>
            {(option) => (
              <box
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={option === store.selected ? theme.warning : theme.backgroundMenu}
              >
                <text fg={option === store.selected ? theme.selectedListItemText : theme.textMuted}>
                  {props.options[option]}
                </text>
              </box>
            )}
          </For>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={theme.text}>
            {"⇆"} <span style={{ fg: theme.textMuted }}>select</span>
          </text>
          <text fg={theme.text}>
            enter <span style={{ fg: theme.textMuted }}>confirm</span>
          </text>
        </box>
      </box>
    </box>
  )
}
