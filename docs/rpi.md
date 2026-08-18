# Research → Plan → Implement (RPI) + Frequent Intentional Compaction

This project **requires plan-first** (see `docs/conventions.md` step 0 and the standing rule
in memory). This doc is the fuller workflow: the three phases, our artifact conventions, and
how we keep the context window healthy (FIC).

## Why — errors compound at different rates
A flawed **research** direction spawns thousands of bad lines; a flawed **plan**, hundreds; a
flawed **line**, one. So concentrate human review where leverage is highest — **research and
planning** — not on every line of generated code.

## The three phases (how we run them here)

### 1. Research — understand before solving
- Explore the codebase (use **subagents / the `Explore` agent** for breadth; read the key
  files yourself in the main context). Document *what IS*, not what should be — no fixes yet.
- **Output:** a structured summary at `docs/agents/research/YYYY-MM-DD-<topic>.md`:
  ```markdown
  ## Research: <topic>
  ### Relevant files
  - path/to/file.js:line — role
  ### Patterns / conventions found
  - …
  ### Implementation notes
  - follow existing pattern in …
  ```

### 2. Plan — the single source of truth
- From the research, write `docs/agents/plans/YYYY-MM-DD-<topic>.md` using
  **[plans/TEMPLATE.md](agents/plans/TEMPLATE.md)**: ordered steps, each with the files to
  touch, the change, and a **Verify** line. **Get explicit user sign-off before any code** —
  that's our standing rule; it's the cheapest checkpoint we have.

### 3. Implement — incrementally, verify each step
- Do **one step at a time**. After each: run its **Verify** check (usually `npm test` plus the
  specific behaviour), then **mark the step `[x]` in the plan**, then continue.
- Close out with the other standing rules: update/create the feature **subagent**, `npm test`,
  ship via the **`deploy`** skill.

## Frequent Intentional Compaction (FIC)
Long tasks exceed one context window, and noise (failed attempts, tangents, debug output)
degrades output quality. So compact **deliberately**, not just when forced:

- **Keep context utilisation ~40–60%.** Compact at **phase boundaries** and whenever the
  thread is cluttered — don't wait to hit the limit.
- **The plan file is the memory.** Summarise progress into it (checked steps + short notes);
  then the conversation can be cleared and only the **plan + the files the next step touches**
  reloaded.
- **Subagents for exploration** — they search/summarise and return just the conclusion, so the
  main context stays clean.
- **Files beat chat history** — `research/*.md` and `plans/*.md` are structured and
  re-loadable; chat is linear and lossy.
- Claude Code: `/compact` compresses the conversation; our on-disk research/plan docs survive
  it, which is the whole point of externalising state.

## Best practices (adapted to us)
- **Invest in research + planning** — highest-leverage review happens here.
- **Write structured artifacts** — headers, bullets, code blocks; parseable by humans *and*
  agents.
- **Verify before proceeding** — every step carries a check; never advance on red.
- **Use subagents for exploration.**
- **Compact proactively** — at phase switches, on degraded responses, after failed attempts.

## Pointers
- Skills: `rpi-research` → `rpi-plan` → `rpi-implement` (invoke as `/rpi-…`).
- Artifacts: `docs/agents/research/`, `docs/agents/plans/` (+ `plans/TEMPLATE.md`).
- Standing rules: plan + confirm before implementing; verify after every major commit
  (`docs/backpressure.md` / `docs/testing.md`).
