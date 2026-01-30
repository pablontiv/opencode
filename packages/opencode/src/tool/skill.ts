import path from "path"
import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"
import { SkillSubstitution } from "../skill/substitution"
import { ConfigMarkdown } from "../config/markdown"
import { PermissionNext } from "../permission/next"

export const SkillTool = Tool.define("skill", async (ctx) => {
  const skills = await Skill.all()

  // Filter skills by agent permissions and disableModelInvocation
  const agent = ctx?.agent
  const accessibleSkills = skills.filter((skill) => {
    // Respect disable-model-invocation (Claude Code compatibility)
    if (skill.disableModelInvocation) return false

    // Check agent permissions
    if (agent) {
      const rule = PermissionNext.evaluate("skill", skill.name, agent.permission)
      return rule.action !== "deny"
    }
    return true
  })

  const description =
    accessibleSkills.length === 0
      ? "Load a skill to get detailed instructions for a specific task. No skills are currently available."
      : [
          "Load a skill to get detailed instructions for a specific task.",
          "Skills provide specialized knowledge and step-by-step guidance.",
          "Use this when a task matches an available skill's description.",
          "Only the skills listed here are available:",
          "<available_skills>",
          ...accessibleSkills.flatMap((skill) =>
            [
              `  <skill>`,
              `    <name>${skill.name}</name>`,
              `    <description>${skill.description}</description>`,
              skill.argumentHint ? `    <arguments>${skill.argumentHint}</arguments>` : "",
              `  </skill>`,
            ].filter(Boolean),
          ),
          "</available_skills>",
        ].join(" ")

  const examples = accessibleSkills
    .map((skill) => `'${skill.name}'`)
    .slice(0, 3)
    .join(", ")
  const hint = examples.length > 0 ? ` (e.g., ${examples}, ...)` : ""

  const parameters = z.object({
    name: z.string().describe(`The skill identifier from available_skills${hint}`),
    arguments: z.string().optional().describe("Arguments to pass to the skill"),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skill = await Skill.get(params.name)

      if (!skill) {
        const available = await Skill.all().then((x) => Object.keys(x).join(", "))
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      await ctx.ask({
        permission: "skill",
        patterns: [params.name],
        always: [params.name],
        metadata: {},
      })

      const rawContent = (await ConfigMarkdown.parse(skill.location)).content
      const dir = path.dirname(skill.location)

      // Process Claude Code style substitutions ($ARGUMENTS, $0, ${CLAUDE_SESSION_ID}, !`cmd`)
      const content = await SkillSubstitution.process(rawContent, params.arguments ?? "", ctx.sessionID)

      // Format output similar to plugin pattern
      const output = [`## Skill: ${skill.name}`, "", `**Base directory**: ${dir}`, "", content.trim()].join("\n")

      return {
        title: `Loaded skill: ${skill.name}`,
        output,
        metadata: {
          name: skill.name,
          dir,
          arguments: params.arguments,
        },
      }
    },
  }
})
