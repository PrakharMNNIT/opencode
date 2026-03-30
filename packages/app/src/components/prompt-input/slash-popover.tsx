import { Component, For, Match, Show, Switch } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { getDirectory, getFilename } from "@opencode-ai/util/path"

export type AtOption =
  | { type: "agent"; name: string; display: string }
  | { type: "file"; path: string; display: string; recent?: boolean }

export interface SlashCommand {
  id: string
  trigger: string
  title: string
  description?: string
  keybind?: string
  type: "builtin" | "custom"
  source?: "command" | "mcp" | "skill"
}

export type SkillOption = {
  type: "skill"
  name: string
  description: string
}

type PromptPopoverProps = {
  popover: "at" | "slash" | "skill" | null
  setSlashPopoverRef: (el: HTMLDivElement) => void
  atFlat: AtOption[]
  atActive?: string
  atKey: (item: AtOption) => string
  setAtActive: (id: string) => void
  onAtSelect: (item: AtOption) => void
  slashFlat: SlashCommand[]
  slashActive?: string
  setSlashActive: (id: string) => void
  onSlashSelect: (item: SlashCommand) => void
  commandKeybind: (id: string) => string | undefined
  t: (key: string) => string
  skillFlat?: SkillOption[]
  skillActive?: string
  onSkillSelect?: (item: SkillOption) => void
  setSkillActive?: (id: string) => void
}

export const PromptPopover: Component<PromptPopoverProps> = (props) => {
  return (
    <Show when={props.popover}>
      <div
        ref={(el) => {
          if (props.popover === "slash") props.setSlashPopoverRef(el)
        }}
        class="absolute inset-x-0 -top-2 -translate-y-full origin-bottom-left max-h-80 min-h-10
                 overflow-auto no-scrollbar flex flex-col p-2 rounded-[12px]
                 bg-surface-raised-stronger-non-alpha shadow-[var(--shadow-lg-border-base)]"
        onMouseDown={(e) => e.preventDefault()}
      >
        <Switch>
          <Match when={props.popover === "at"}>
            <Show
              when={props.atFlat.length > 0}
              fallback={<div class="text-text-weak px-2 py-1">{props.t("prompt.popover.emptyResults")}</div>}
            >
              <For each={props.atFlat.slice(0, 10)}>
                {(item) => {
                  const key = props.atKey(item)

                  if (item.type === "agent") {
                    return (
                      <button
                        class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                        classList={{ "bg-surface-raised-base-hover": props.atActive === key }}
                        onClick={() => props.onAtSelect(item)}
                        onMouseEnter={() => props.setAtActive(key)}
                      >
                        <Icon name="brain" size="small" class="text-icon-info-active shrink-0" />
                        <span class="text-14-regular text-text-strong whitespace-nowrap">@{item.name}</span>
                      </button>
                    )
                  }

                  const isDirectory = item.path.endsWith("/")
                  const directory = isDirectory ? item.path : getDirectory(item.path)
                  const filename = isDirectory ? "" : getFilename(item.path)

                  return (
                    <button
                      class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                      classList={{ "bg-surface-raised-base-hover": props.atActive === key }}
                      onClick={() => props.onAtSelect(item)}
                      onMouseEnter={() => props.setAtActive(key)}
                    >
                      <FileIcon node={{ path: item.path, type: "file" }} class="shrink-0 size-4" />
                      <div class="flex items-center text-14-regular min-w-0">
                        <span class="text-text-weak whitespace-nowrap truncate min-w-0">{directory}</span>
                        <Show when={!isDirectory}>
                          <span class="text-text-strong whitespace-nowrap">{filename}</span>
                        </Show>
                      </div>
                    </button>
                  )
                }}
              </For>
            </Show>
          </Match>
          <Match when={props.popover === "slash"}>
            <Show
              when={props.slashFlat.length > 0}
              fallback={<div class="text-text-weak px-2 py-1">{props.t("prompt.popover.emptyCommands")}</div>}
            >
              <For each={props.slashFlat}>
                {(cmd) => (
                  <button
                    data-slash-id={cmd.id}
                    classList={{
                      "w-full flex items-center justify-between gap-4 rounded-md px-2 py-1": true,
                      "bg-surface-raised-base-hover": props.slashActive === cmd.id,
                    }}
                    onClick={() => props.onSlashSelect(cmd)}
                    onMouseEnter={() => props.setSlashActive(cmd.id)}
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-14-regular text-text-strong whitespace-nowrap">/{cmd.trigger}</span>
                      <Show when={cmd.description}>
                        <span class="text-14-regular text-text-weak truncate">{cmd.description}</span>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <Show when={cmd.type === "custom" && cmd.source !== "command"}>
                        <span class="text-11-regular text-text-subtle px-1.5 py-0.5 bg-surface-base rounded">
                          {cmd.source === "skill"
                            ? props.t("prompt.slash.badge.skill")
                            : cmd.source === "mcp"
                              ? props.t("prompt.slash.badge.mcp")
                              : props.t("prompt.slash.badge.custom")}
                        </span>
                      </Show>
                      <Show when={props.commandKeybind(cmd.id)}>
                        <span class="text-12-regular text-text-subtle">{props.commandKeybind(cmd.id)}</span>
                      </Show>
                    </div>
                  </button>
                )}
              </For>
            </Show>
          </Match>
          <Match when={props.popover === "skill"}>
            <Show
              when={props.skillFlat && props.skillFlat.length > 0}
              fallback={
                <div class="flex flex-col gap-1.5 px-2 py-2 text-center">
                  <span class="text-14-regular text-text-strong">💡 No skills installed</span>
                  <span class="text-12-regular text-text-weak">Add skills to ~/.claude/skills/</span>
                </div>
              }
            >
              <For each={props.skillFlat}>
                {(skill) => (
                  <button
                    classList={{
                      "w-full flex items-center gap-2 rounded-md px-2 py-1": true,
                      "bg-surface-raised-base-hover": props.skillActive === skill.name,
                    }}
                    data-skill-name={skill.name}
                    onClick={() => props.onSkillSelect?.(skill)}
                    onMouseEnter={() => props.setSkillActive?.(skill.name)}
                  >
                    <span class="text-14-regular text-syntax-string whitespace-nowrap">${skill.name}</span>
                    <Show when={skill.description}>
                      <span class="text-14-regular text-text-weak truncate">{skill.description}</span>
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </Match>
        </Switch>
      </div>
    </Show>
  )
}
