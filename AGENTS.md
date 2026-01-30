# OpenCode Agent Guidelines

## Build/Test Commands

- **Install**: `bun install`
- **Run dev**: `bun run dev` (from root) or `bun run --cwd packages/opencode --conditions=browser src/index.ts`
- **Typecheck**: `bun run typecheck` (uses turbo, runs tsgo across all packages)
- **Test all**: `bun test` (run from `packages/opencode/`)
- **Single test**: `bun test test/tool/grep.test.ts` (from `packages/opencode/`)
- **Test pattern**: `bun test --test-name-pattern "basic search"` (filter by test name)
- **Build**: `bun run build` (from `packages/opencode/`)
- **Regenerate SDK**: `./packages/sdk/js/script/build.ts`

## Repository Structure

- **Monorepo**: Uses Bun workspaces with packages in `packages/`
- **Main package**: `packages/opencode/` - the core CLI and TUI
- **Default branch**: `dev` (not main)
- **Package manager**: Bun 1.3.5

## Code Style

### General Principles

- Keep things in one function unless composable or reusable
- Avoid unnecessary destructuring - use `obj.a` instead of `const { a } = obj` to preserve context
- Avoid `try`/`catch` where possible - let errors propagate or use Result patterns
- Avoid `any` type - use `unknown` or proper typing
- Prefer single-word variable names when possible
- Use Bun APIs: `Bun.file()`, `Bun.write()`, `Bun.spawn()`, `Bun.Glob`
- Rely on type inference - avoid explicit annotations unless necessary for exports

### Avoid `let` Statements

Prefer `const` with ternaries or early returns:

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Avoid `else` Statements

Use early returns instead:

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Naming Conventions

- Single-word names preferred: `foo`, `bar`, `ctx`, `cfg`
- camelCase for variables/functions
- PascalCase for classes, namespaces, types, and Zod schemas
- Namespace pattern for modules: `Tool.define()`, `Session.create()`, `Config.get()`

### Imports

- Use relative imports for local modules
- Named imports preferred over default imports
- Path aliases supported: `@/` maps to `src/`

```ts
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import { Flag } from "@/flag/flag"
```

### TypeScript Patterns

- **Zod schemas** for validation: define schema, then infer type
- **Namespaces** for module organization with exported functions/types
- **`z.infer<typeof Schema>`** to derive types from Zod schemas

```ts
export namespace Skill {
  export const Info = z.object({
    name: z.string(),
    description: z.string(),
  })
  export type Info = z.infer<typeof Info>

  export async function get(name: string) {
    return state().then((x) => x[name])
  }
}
```

### Error Handling

- Use `NamedError.create()` for domain errors with structured data
- Avoid try/catch - prefer `.catch()` on promises
- Let errors propagate when appropriate

```ts
export const InvalidError = NamedError.create(
  "SkillInvalidError",
  z.object({
    path: z.string(),
    message: z.string().optional(),
  }),
)
```

### Async Patterns

- Use `async`/`await` over `.then()` chains for readability
- Use `Array.fromAsync()` for async iterators
- Use `Bun.spawn()` for subprocesses

```ts
const matches = await Array.fromAsync(glob.scan({ cwd: dir, absolute: true, onlyFiles: true }))
```

## Testing

- **Framework**: Bun test (`bun:test`)
- **NO mocks** - test actual implementation, not duplicated logic
- Use `describe` and `test` from `bun:test`
- Use `Instance.provide()` for test context injection
- Use fixture helpers from `test/fixture/fixture.ts`

```ts
import { describe, expect, test } from "bun:test"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("tool.grep", () => {
  test("basic search", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const grep = await GrepTool.init()
        const result = await grep.execute({ pattern: "export" }, ctx)
        expect(result.metadata.matches).toBeGreaterThan(0)
      },
    })
  })
})
```

## Formatting

- **Prettier**: semi: false, printWidth: 120
- No semicolons
- 120 character line width

## Tool Guidelines

When executing tools:

- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE
- Use `ctx.ask()` for permission checks before file/system operations
- Tools implement `Tool.define()` with description, parameters (Zod), and execute function

## Key Files

- `src/session/instruction.ts` - System prompt and instructions loading
- `src/config/config.ts` - Configuration loading and merging
- `src/skill/skill.ts` - Skill/command loading from `.claude/skills/` and `.opencode/skill/`
- `src/tool/*.ts` - Built-in tools (grep, read, edit, bash, etc.)
- `src/plugin/index.ts` - Plugin system and hooks
