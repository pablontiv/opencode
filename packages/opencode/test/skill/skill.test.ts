import { test, expect } from "bun:test"
import { Skill } from "../../src/skill"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import fs from "fs/promises"

async function createGlobalSkill(homeDir: string) {
  const skillDir = path.join(homeDir, ".claude", "skills", "global-test-skill")
  await fs.mkdir(skillDir, { recursive: true })
  await Bun.write(
    path.join(skillDir, "SKILL.md"),
    `---
name: global-test-skill
description: A global skill from ~/.claude/skills for testing.
---

# Global Test Skill

This skill is loaded from the global home directory.
`,
  )
}

test("discovers skills from .opencode/skill/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".opencode", "skill", "test-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: test-skill
description: A test skill for verification.
---

# Test Skill

Instructions here.
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.length).toBe(1)
      const testSkill = skills.find((s) => s.name === "test-skill")
      expect(testSkill).toBeDefined()
      expect(testSkill!.description).toBe("A test skill for verification.")
      expect(testSkill!.location).toContain("skill/test-skill/SKILL.md")
    },
  })
})

test("discovers multiple skills from .opencode/skill/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir1 = path.join(dir, ".opencode", "skill", "skill-one")
      const skillDir2 = path.join(dir, ".opencode", "skill", "skill-two")
      await Bun.write(
        path.join(skillDir1, "SKILL.md"),
        `---
name: skill-one
description: First test skill.
---

# Skill One
`,
      )
      await Bun.write(
        path.join(skillDir2, "SKILL.md"),
        `---
name: skill-two
description: Second test skill.
---

# Skill Two
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.length).toBe(2)
      expect(skills.find((s) => s.name === "skill-one")).toBeDefined()
      expect(skills.find((s) => s.name === "skill-two")).toBeDefined()
    },
  })
})

test("skips skills with missing frontmatter", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".opencode", "skill", "no-frontmatter")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `# No Frontmatter

Just some content without YAML frontmatter.
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills).toEqual([])
    },
  })
})

test("discovers skills from .claude/skills/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".claude", "skills", "claude-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.length).toBe(1)
      const claudeSkill = skills.find((s) => s.name === "claude-skill")
      expect(claudeSkill).toBeDefined()
      expect(claudeSkill!.location).toContain(".claude/skills/claude-skill/SKILL.md")
    },
  })
})

test("discovers global skills from ~/.claude/skills/ directory", async () => {
  await using tmp = await tmpdir({ git: true })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path

  try {
    await createGlobalSkill(tmp.path)
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills.length).toBe(1)
        expect(skills[0].name).toBe("global-test-skill")
        expect(skills[0].description).toBe("A global skill from ~/.claude/skills for testing.")
        expect(skills[0].location).toContain(".claude/skills/global-test-skill/SKILL.md")
      },
    })
  } finally {
    process.env.OPENCODE_TEST_HOME = originalHome
  }
})

test("returns empty array when no skills exist", async () => {
  await using tmp = await tmpdir({ git: true })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills).toEqual([])
    },
  })
})

// ── Claude Code Compatibility Tests ──

test("parses all Claude Code frontmatter fields", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".claude", "skills", "full-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: full-skill
description: A skill with all Claude Code fields
argument-hint: "[file] [format]"
disable-model-invocation: true
user-invocable: true
allowed-tools: Read, Grep, Glob
model: claude-sonnet-4-20250514
context: fork
agent: Explore
---

# Full Skill

Instructions with all fields.
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.length).toBe(1)
      const skill = skills[0]
      expect(skill.name).toBe("full-skill")
      expect(skill.description).toBe("A skill with all Claude Code fields")
      expect(skill.argumentHint).toBe("[file] [format]")
      expect(skill.disableModelInvocation).toBe(true)
      expect(skill.userInvocable).toBe(true)
      expect(skill.allowedTools).toEqual(["Read", "Grep", "Glob"])
      expect(skill.model).toBe("claude-sonnet-4-20250514")
      expect(skill.context).toBe("fork")
      expect(skill.agent).toBe("Explore")
    },
  })
})

test("defaults user-invocable to true when not specified", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".claude", "skills", "default-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: default-skill
description: A skill with minimal fields
---

# Default Skill
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.length).toBe(1)
      expect(skills[0].userInvocable).toBe(true)
    },
  })
})

test("parses user-invocable: false correctly", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".claude", "skills", "hidden-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: hidden-skill
description: A skill hidden from user menu
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
      const skills = await Skill.all()
      expect(skills.length).toBe(1)
      expect(skills[0].userInvocable).toBe(false)
    },
  })
})

test("parses disable-model-invocation correctly", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".claude", "skills", "manual-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: manual-skill
description: A skill only invoked manually
disable-model-invocation: true
---

# Manual Skill
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.length).toBe(1)
      expect(skills[0].disableModelInvocation).toBe(true)
    },
  })
})

test("parses allowed-tools as comma-separated string", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".claude", "skills", "tools-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: tools-skill
description: A skill with allowed tools
allowed-tools: Read, Write, Bash(git *)
---

# Tools Skill
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.length).toBe(1)
      expect(skills[0].allowedTools).toEqual(["Read", "Write", "Bash(git *)"])
    },
  })
})

test("parses arguments array from Claude Code skill", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".claude", "skills", "args-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: args-skill
description: A skill with typed arguments
arguments:
  - name: file
    description: The file to process
    required: true
  - name: format
    description: Output format
    required: false
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
      const skills = await Skill.all()
      expect(skills.length).toBe(1)
      const skill = skills[0]
      expect(skill.arguments).toBeDefined()
      expect(skill.arguments!.length).toBe(2)
      expect(skill.arguments![0].name).toBe("file")
      expect(skill.arguments![0].description).toBe("The file to process")
      expect(skill.arguments![0].required).toBe(true)
      expect(skill.arguments![1].name).toBe("format")
      expect(skill.arguments![1].required).toBe(false)
    },
  })
})

test("parses context: fork for subagent execution", async () => {
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

Research $ARGUMENTS thoroughly
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.length).toBe(1)
      expect(skills[0].context).toBe("fork")
      expect(skills[0].agent).toBe("Explore")
    },
  })
})
