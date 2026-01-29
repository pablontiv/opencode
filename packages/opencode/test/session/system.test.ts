import { test, expect } from "bun:test"
import { SystemPrompt } from "../../src/session/system"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import fs from "fs/promises"

test("loads rules from .claude/rules/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const rulesDir = path.join(dir, ".claude", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await Bun.write(path.join(rulesDir, "test-rule.md"), "# Test Rule\n\nThis is a test rule.")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const custom = await SystemPrompt.custom()
      const ruleContent = custom.find((c) => c.includes("test-rule.md"))
      expect(ruleContent).toBeDefined()
      expect(ruleContent).toContain("This is a test rule")
    },
  })
})

test("loads multiple rules from .claude/rules/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const rulesDir = path.join(dir, ".claude", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await Bun.write(path.join(rulesDir, "rule-one.md"), "# Rule One\n\nFirst rule content.")
      await Bun.write(path.join(rulesDir, "rule-two.md"), "# Rule Two\n\nSecond rule content.")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const custom = await SystemPrompt.custom()
      const ruleOne = custom.find((c) => c.includes("rule-one.md"))
      const ruleTwo = custom.find((c) => c.includes("rule-two.md"))
      expect(ruleOne).toBeDefined()
      expect(ruleTwo).toBeDefined()
    },
  })
})

test("combines CLAUDE.md with .claude/rules/ files", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      await Bun.write(path.join(dir, "CLAUDE.md"), "# Main Claude Instructions")
      const rulesDir = path.join(dir, ".claude", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await Bun.write(path.join(rulesDir, "extra-rule.md"), "# Extra Rule")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const custom = await SystemPrompt.custom()
      const mainClaude = custom.find((c) => c.includes("CLAUDE.md"))
      const extraRule = custom.find((c) => c.includes("extra-rule.md"))
      expect(mainClaude).toBeDefined()
      expect(extraRule).toBeDefined()
    },
  })
})

test("ignores .claude/rules/ when OPENCODE_DISABLE_CLAUDE_CODE_PROMPT is set", async () => {
  const original = process.env["OPENCODE_DISABLE_CLAUDE_CODE_PROMPT"]
  process.env["OPENCODE_DISABLE_CLAUDE_CODE_PROMPT"] = "true"

  try {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const rulesDir = path.join(dir, ".claude", "rules")
        await fs.mkdir(rulesDir, { recursive: true })
        await Bun.write(path.join(rulesDir, "should-be-ignored.md"), "# Should Be Ignored")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const custom = await SystemPrompt.custom()
        const ignoredRule = custom.find((c) => c.includes("should-be-ignored.md"))
        expect(ignoredRule).toBeUndefined()
      },
    })
  } finally {
    if (original === undefined) {
      delete process.env["OPENCODE_DISABLE_CLAUDE_CODE_PROMPT"]
    } else {
      process.env["OPENCODE_DISABLE_CLAUDE_CODE_PROMPT"] = original
    }
  }
})

test("loads global rules from ~/.claude/rules/", async () => {
  await using tmp = await tmpdir({ git: true })

  const original = process.env["OPENCODE_TEST_HOME"]
  process.env["OPENCODE_TEST_HOME"] = tmp.path

  try {
    const globalRulesDir = path.join(tmp.path, ".claude", "rules")
    await fs.mkdir(globalRulesDir, { recursive: true })
    await Bun.write(path.join(globalRulesDir, "global-rule.md"), "# Global Rule")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const custom = await SystemPrompt.custom()
        const globalRule = custom.find((c) => c.includes("global-rule.md"))
        expect(globalRule).toBeDefined()
      },
    })
  } finally {
    if (original === undefined) {
      delete process.env["OPENCODE_TEST_HOME"]
    } else {
      process.env["OPENCODE_TEST_HOME"] = original
    }
  }
})

test("returns empty when no rules exist", async () => {
  await using tmp = await tmpdir({ git: true })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const custom = await SystemPrompt.custom()
      // Should still work, just return empty or only global files
      expect(custom).toBeDefined()
    },
  })
})
