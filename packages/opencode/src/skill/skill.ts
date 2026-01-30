import z from "zod"
import path from "path"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { NamedError } from "@opencode-ai/util/error"
import { ConfigMarkdown } from "../config/markdown"
import { Log } from "../util/log"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"
import { Flag } from "@/flag/flag"
import { Bus } from "@/bus"
import { Session } from "@/session"

export namespace Skill {
  const log = Log.create({ service: "skill" })

  // Schema for skill arguments (Claude Code compatibility)
  export const Argument = z.object({
    name: z.string(),
    description: z.string().optional(),
    required: z.boolean().optional().default(false),
  })
  export type Argument = z.infer<typeof Argument>

  // Full skill info schema with Claude Code frontmatter fields
  export const Info = z.object({
    // Core fields
    name: z.string(),
    description: z.string(),
    location: z.string(),

    // Claude Code frontmatter fields
    argumentHint: z.string().optional(), // argument-hint
    disableModelInvocation: z.boolean().optional(), // disable-model-invocation
    userInvocable: z.boolean().optional().default(true), // user-invocable
    allowedTools: z.array(z.string()).optional(), // allowed-tools
    model: z.string().optional(), // model
    context: z.enum(["fork"]).optional(), // context
    agent: z.string().optional(), // agent
    hooks: z.record(z.string(), z.unknown()).optional(), // hooks (pass-through)
    arguments: z.array(Argument).optional(), // arguments array
  })
  export type Info = z.infer<typeof Info>

  export const InvalidError = NamedError.create(
    "SkillInvalidError",
    z.object({
      path: z.string(),
      message: z.string().optional(),
      issues: z.custom<z.core.$ZodIssue[]>().optional(),
    }),
  )

  export const NameMismatchError = NamedError.create(
    "SkillNameMismatchError",
    z.object({
      path: z.string(),
      expected: z.string(),
      actual: z.string(),
    }),
  )

  const OPENCODE_SKILL_GLOB = new Bun.Glob("{skill,skills}/**/SKILL.md")
  const CLAUDE_SKILL_GLOB = new Bun.Glob("skills/**/SKILL.md")

  export const state = Instance.state(async () => {
    const skills: Record<string, Info> = {}

    const addSkill = async (match: string) => {
      const md = await ConfigMarkdown.parse(match).catch((err) => {
        const message = ConfigMarkdown.FrontmatterError.isInstance(err)
          ? err.data.message
          : `Failed to parse skill ${match}`
        Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        log.error("failed to load skill", { skill: match, err })
        return undefined
      })

      if (!md) return

      // Map Claude Code kebab-case frontmatter to camelCase
      // Parse allowed-tools from comma-separated string if needed
      const allowedToolsRaw = md.data["allowed-tools"]
      const allowedTools =
        typeof allowedToolsRaw === "string"
          ? allowedToolsRaw.split(",").map((s: string) => s.trim())
          : Array.isArray(allowedToolsRaw)
            ? allowedToolsRaw
            : undefined

      const parsed = Info.omit({ location: true }).safeParse({
        name: md.data.name,
        description: md.data.description,
        argumentHint: md.data["argument-hint"],
        disableModelInvocation: md.data["disable-model-invocation"],
        userInvocable: md.data["user-invocable"] ?? true,
        allowedTools,
        model: md.data.model,
        context: md.data.context,
        agent: md.data.agent,
        hooks: md.data.hooks,
        arguments: md.data.arguments,
      })

      if (!parsed.success) {
        log.warn("failed to parse skill frontmatter", { skill: match, issues: parsed.error.issues })
        return
      }

      // Warn on duplicate skill names
      if (skills[parsed.data.name]) {
        log.warn("duplicate skill name", {
          name: parsed.data.name,
          existing: skills[parsed.data.name].location,
          duplicate: match,
        })
      }

      skills[parsed.data.name] = {
        ...parsed.data,
        location: match,
      }
    }

    // Scan .claude/skills/ directories (project-level)
    const claudeDirs = await Array.fromAsync(
      Filesystem.up({
        targets: [".claude"],
        start: Instance.directory,
        stop: Instance.worktree,
      }),
    )
    // Also include global ~/.claude/skills/
    const globalClaude = `${Global.Path.home}/.claude`
    if (await Filesystem.isDir(globalClaude)) {
      claudeDirs.push(globalClaude)
    }

    if (!Flag.OPENCODE_DISABLE_CLAUDE_CODE_SKILLS) {
      for (const dir of claudeDirs) {
        const matches = await Array.fromAsync(
          CLAUDE_SKILL_GLOB.scan({
            cwd: dir,
            absolute: true,
            onlyFiles: true,
            followSymlinks: true,
            dot: true,
          }),
        ).catch((error) => {
          log.error("failed .claude directory scan for skills", { dir, error })
          return []
        })

        for (const match of matches) {
          await addSkill(match)
        }
      }
    }

    // Scan .opencode/skill/ directories
    for (const dir of await Config.directories()) {
      for await (const match of OPENCODE_SKILL_GLOB.scan({
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        followSymlinks: true,
      })) {
        await addSkill(match)
      }
    }

    return skills
  })

  export async function get(name: string) {
    return state().then((x) => x[name])
  }

  export async function all() {
    return state().then((x) => Object.values(x))
  }
}
