import { describe, test, expect } from "bun:test"
import { SkillSubstitution } from "../../src/skill/substitution"

describe("SkillSubstitution", () => {
  const sessionID = "ses_test123"

  test("replaces $ARGUMENTS with all args", async () => {
    const content = "Process $ARGUMENTS"
    const result = await SkillSubstitution.process(content, "file.ts json", sessionID)
    expect(result).toBe("Process file.ts json")
  })

  test("replaces $ARGUMENTS[0] with first arg", async () => {
    const content = "Process $ARGUMENTS[0] with format $ARGUMENTS[1]"
    const result = await SkillSubstitution.process(content, "file.ts json", sessionID)
    expect(result).toBe("Process file.ts with format json")
  })

  test("replaces $0, $1, $2 shorthand", async () => {
    const content = "Migrate $0 from $1 to $2"
    const result = await SkillSubstitution.process(content, "SearchBar React Vue", sessionID)
    expect(result).toBe("Migrate SearchBar from React to Vue")
  })

  test("handles missing indexed args gracefully", async () => {
    const content = "Process $0 and $1 and $2"
    const result = await SkillSubstitution.process(content, "only-one", sessionID)
    expect(result).toBe("Process only-one and  and ")
  })

  test("replaces ${CLAUDE_SESSION_ID}", async () => {
    const content = "Log to logs/${CLAUDE_SESSION_ID}.log"
    const result = await SkillSubstitution.process(content, "", sessionID)
    expect(result).toBe("Log to logs/ses_test123.log")
  })

  test("appends ARGUMENTS when not in content", async () => {
    const content = "Do something with the file"
    const result = await SkillSubstitution.process(content, "myfile.ts", sessionID)
    expect(result).toBe("Do something with the file\n\nARGUMENTS: myfile.ts")
  })

  test("does not append ARGUMENTS when $ARGUMENTS is present", async () => {
    const content = "Process $ARGUMENTS here"
    const result = await SkillSubstitution.process(content, "myfile.ts", sessionID)
    expect(result).toBe("Process myfile.ts here")
    expect(result).not.toContain("\n\nARGUMENTS:")
  })

  test("does not append ARGUMENTS when $N is present", async () => {
    const content = "Process $0 here"
    const result = await SkillSubstitution.process(content, "myfile.ts", sessionID)
    expect(result).toBe("Process myfile.ts here")
    expect(result).not.toContain("\n\nARGUMENTS:")
  })

  test("does not append ARGUMENTS when args are empty", async () => {
    const content = "Do something"
    const result = await SkillSubstitution.process(content, "", sessionID)
    expect(result).toBe("Do something")
  })

  test("handles quoted arguments", async () => {
    const content = "Process $0 with $1"
    const result = await SkillSubstitution.process(content, '"file with spaces.ts" json', sessionID)
    expect(result).toBe("Process file with spaces.ts with json")
  })

  test("handles single-quoted arguments", async () => {
    const content = "Process $0 with $1"
    const result = await SkillSubstitution.process(content, "'file with spaces.ts' json", sessionID)
    expect(result).toBe("Process file with spaces.ts with json")
  })

  test("processes !`echo` shell injection", async () => {
    const content = "Current date: !`echo test-output`"
    const result = await SkillSubstitution.process(content, "", sessionID)
    expect(result).toBe("Current date: test-output")
  })

  test("handles failed shell injection gracefully", async () => {
    const content = "Result: !`nonexistent-command-12345`"
    const result = await SkillSubstitution.process(content, "", sessionID)
    expect(result).toContain("[Error")
  })

  test("processes multiple substitutions together", async () => {
    const content = `
Session: \${CLAUDE_SESSION_ID}
File: $0
Format: $1
All args: $ARGUMENTS
`
    const result = await SkillSubstitution.process(content, "myfile.ts json", sessionID)
    expect(result).toContain("Session: ses_test123")
    expect(result).toContain("File: myfile.ts")
    expect(result).toContain("Format: json")
    expect(result).toContain("All args: myfile.ts json")
  })

  test("does not replace $N inside ${...} patterns", async () => {
    const content = "Use ${VAR} and $0"
    const result = await SkillSubstitution.process(content, "arg", sessionID)
    expect(result).toBe("Use ${VAR} and arg")
  })
})
