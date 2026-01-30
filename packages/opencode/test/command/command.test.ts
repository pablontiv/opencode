import { describe, test, expect } from "bun:test"
import { Command } from "../../src/command"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"

describe("Command", () => {
  describe("skills as commands (Claude Code compatibility)", () => {
    test("loads user-invocable skills as slash commands", async () => {
      await using tmp = await tmpdir({
        git: true,
        init: async (dir) => {
          const skillDir = path.join(dir, ".claude", "skills", "my-skill")
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: my-skill
description: A skill that becomes a command
user-invocable: true
---

# My Skill

Do something useful.
`,
          )
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const commands = await Command.list()
          const skillCommand = commands.find((c) => c.name === "my-skill")
          expect(skillCommand).toBeDefined()
          expect(skillCommand!.description).toBe("A skill that becomes a command")
        },
      })
    })

    test("does not load skills with user-invocable: false as commands", async () => {
      await using tmp = await tmpdir({
        git: true,
        init: async (dir) => {
          const skillDir = path.join(dir, ".claude", "skills", "hidden-skill")
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: hidden-skill
description: A hidden skill
user-invocable: false
---

# Hidden Skill
`,
          )
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const commands = await Command.list()
          const hiddenCommand = commands.find((c) => c.name === "hidden-skill")
          expect(hiddenCommand).toBeUndefined()
        },
      })
    })

    test("skill command has correct hints from argument-hint", async () => {
      await using tmp = await tmpdir({
        git: true,
        init: async (dir) => {
          const skillDir = path.join(dir, ".claude", "skills", "args-skill")
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: args-skill
description: A skill with argument hint
argument-hint: "[file] [format]"
---

# Args Skill

Process $0 with format $1
`,
          )
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const commands = await Command.list()
          const argsCommand = commands.find((c) => c.name === "args-skill")
          expect(argsCommand).toBeDefined()
          expect(argsCommand!.hints).toEqual(["[file] [format]"])
        },
      })
    })

    test("skill command has hints from arguments array", async () => {
      await using tmp = await tmpdir({
        git: true,
        init: async (dir) => {
          const skillDir = path.join(dir, ".claude", "skills", "typed-args-skill")
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: typed-args-skill
description: A skill with typed arguments
arguments:
  - name: file
    description: The file
    required: true
  - name: format
    description: Output format
---

# Typed Args Skill
`,
          )
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const commands = await Command.list()
          const typedCommand = commands.find((c) => c.name === "typed-args-skill")
          expect(typedCommand).toBeDefined()
          expect(typedCommand!.hints).toEqual(["$1", "$2"])
        },
      })
    })

    test("skill with context: fork sets subtask to true", async () => {
      await using tmp = await tmpdir({
        git: true,
        init: async (dir) => {
          const skillDir = path.join(dir, ".claude", "skills", "fork-skill")
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: fork-skill
description: A skill that runs in a subagent
context: fork
agent: Explore
---

# Fork Skill
`,
          )
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const commands = await Command.list()
          const forkCommand = commands.find((c) => c.name === "fork-skill")
          expect(forkCommand).toBeDefined()
          expect(forkCommand!.subtask).toBe(true)
          expect(forkCommand!.agent).toBe("Explore")
        },
      })
    })

    test("skill command uses model from frontmatter", async () => {
      await using tmp = await tmpdir({
        git: true,
        init: async (dir) => {
          const skillDir = path.join(dir, ".claude", "skills", "model-skill")
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: model-skill
description: A skill with specific model
model: claude-sonnet-4-20250514
---

# Model Skill
`,
          )
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const commands = await Command.list()
          const modelCommand = commands.find((c) => c.name === "model-skill")
          expect(modelCommand).toBeDefined()
          expect(modelCommand!.model).toBe("claude-sonnet-4-20250514")
        },
      })
    })

    test("config commands take priority over skills with same name", async () => {
      await using tmp = await tmpdir({
        git: true,
        init: async (dir) => {
          // Create a skill
          const skillDir = path.join(dir, ".claude", "skills", "review")
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: review
description: Skill review
---

# Review Skill
`,
          )
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const commands = await Command.list()
          // The built-in 'review' command should take priority
          const reviewCommand = commands.find((c) => c.name === "review")
          expect(reviewCommand).toBeDefined()
          // Built-in review has different description
          expect(reviewCommand!.description).toContain("review changes")
        },
      })
    })

    test("skill command template returns skill content", async () => {
      await using tmp = await tmpdir({
        git: true,
        init: async (dir) => {
          const skillDir = path.join(dir, ".claude", "skills", "content-skill")
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: content-skill
description: Test content
---

# Content Skill

This is the skill content that should be returned.
`,
          )
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const command = await Command.get("content-skill")
          expect(command).toBeDefined()
          const template = await command!.template
          expect(template).toContain("This is the skill content that should be returned.")
        },
      })
    })
  })
})
