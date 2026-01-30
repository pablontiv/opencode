import { Log } from "../util/log"

const log = Log.create({ service: "skill.substitution" })

export namespace SkillSubstitution {
  /**
   * Process Claude Code style variable substitutions in skill content.
   *
   * Supports:
   * - $ARGUMENTS - All arguments passed to the skill
   * - $ARGUMENTS[N] - Access argument by 0-based index
   * - $N - Shorthand for $ARGUMENTS[N] (e.g., $0, $1, $2)
   * - ${CLAUDE_SESSION_ID} - Current session ID
   * - !`command` - Shell command injection (preprocessing)
   *
   * If $ARGUMENTS is not present in the content, arguments are appended
   * as "ARGUMENTS: <value>" at the end.
   */
  export async function process(content: string, args: string, sessionID: string): Promise<string> {
    let result = content
    const hasArgumentsPlaceholder = content.includes("$ARGUMENTS") || /\$\d+/.test(content)

    // Split args for indexed access (handles quoted strings and regular args)
    const argList = parseArgs(args)

    // Replace $ARGUMENTS[N] first (more specific pattern)
    result = result.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, n) => {
      const idx = parseInt(n, 10)
      return argList[idx] ?? ""
    })

    // Replace $N shorthand (e.g., $0, $1, $2)
    // Use negative lookbehind to avoid replacing ${...} patterns
    result = result.replace(/(?<!\{)\$(\d+)(?!\})/g, (_, n) => {
      const idx = parseInt(n, 10)
      return argList[idx] ?? ""
    })

    // Replace $ARGUMENTS with full args string
    result = result.replace(/\$ARGUMENTS/g, args)

    // Replace ${CLAUDE_SESSION_ID}
    result = result.replace(/\$\{CLAUDE_SESSION_ID\}/g, sessionID)

    // Process !`command` shell injections
    result = await processShellInjections(result)

    // If no $ARGUMENTS placeholder was in content, append args
    if (!hasArgumentsPlaceholder && args.trim()) {
      result += `\n\nARGUMENTS: ${args}`
    }

    return result
  }

  /**
   * Parse arguments string, respecting quoted strings
   */
  function parseArgs(args: string): string[] {
    if (!args.trim()) return []

    const result: string[] = []
    let current = ""
    let inQuotes = false
    let quoteChar = ""

    for (const char of args) {
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true
        quoteChar = char
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false
        quoteChar = ""
      } else if (char === " " && !inQuotes) {
        if (current.trim()) {
          result.push(current.trim())
        }
        current = ""
      } else {
        current += char
      }
    }

    if (current.trim()) {
      result.push(current.trim())
    }

    return result
  }

  /**
   * Process !`command` shell injections.
   * Executes shell commands and replaces with their output.
   */
  async function processShellInjections(content: string): Promise<string> {
    const shellPattern = /!`([^`]+)`/g
    const matches = Array.from(content.matchAll(shellPattern))

    if (matches.length === 0) return content

    let result = content

    for (const match of matches) {
      const cmd = match[1]
      try {
        // Use Bun shell to execute command
        const proc = Bun.spawn(["sh", "-c", cmd], {
          stdout: "pipe",
          stderr: "pipe",
        })
        const output = await new Response(proc.stdout).text()
        const exitCode = await proc.exited

        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text()
          log.warn("shell injection command failed", { cmd, exitCode, stderr })
          result = result.replace(match[0], `[Error: ${stderr.trim() || `exit code ${exitCode}`}]`)
        } else {
          result = result.replace(match[0], output.trim())
        }
      } catch (err) {
        log.error("shell injection failed", { cmd, err })
        result = result.replace(match[0], `[Error running: ${cmd}]`)
      }
    }

    return result
  }
}
