# MCP vs Skills — Research Synthesis

Sources: Anthropic engineering blog (Oct 16, 2025), Claude blog (Dec 19, 2025), and ~15 third-party technical writeups (Oct 2025 – May 2026).

## TL;DR

> "Skills describe the workflow. MCP provides the runner." — Angie Jones, Block

They are **complementary layers**, not competitors. Pick by question:

- "Can Claude *reach* this system?" → **MCP**
- "Does Claude *know how* to use what it can already reach?" → **Skill**

Most real workflows need both.

---

## What each one is

### MCP (Model Context Protocol)
- Open protocol Anthropic released **Nov 2024**.
- A separate process that exposes **tools** (functions), **resources** (data), and **prompts** (templates) over JSON-RPC (stdio or HTTP+SSE).
- Vendor-neutral — any MCP-compatible client (Claude, Cursor, Cline, custom) can consume the same server.
- Handles auth, transport, schemas. OAuth/per-user auth is in the spec.
- Tool schemas are **loaded into context at session start** (mitigated by Claude Code's Tool Search, Jan 2026, which lazy-loads schemas >10% of context).

### Agent Skills
- Anthropic released **Oct 16, 2025**; published as an open standard **Dec 18, 2025**.
- A folder containing `SKILL.md` (YAML frontmatter: `name`, `description` + markdown body) plus optional scripts, templates, and reference files.
- **Progressive disclosure** is the core design:
  1. At startup only `name` + `description` (~30–50 tokens each) load into the system prompt.
  2. If relevant, Claude reads the full `SKILL.md`.
  3. Bundled files (`forms.md`, `reference.md`, etc.) load only when the SKILL.md instructs.
- No network, no server. Just files Claude reads via Bash/filesystem.
- Can ship executable scripts (Python, shell) the agent invokes — useful for deterministic ops Claude shouldn't reason token-by-token (sorting, parsing, etc.).
- Portable across Claude.ai, Claude Code, Claude Agent SDK, and the Claude Developer Platform.

---

## Side-by-side

| Dimension | MCP | Skills |
|---|---|---|
| Primary purpose | Connectivity (what Claude *can do*) | Procedural knowledge (how Claude *should do it*) |
| Released | Nov 2024 | Oct 2025 (open standard Dec 2025) |
| Form factor | Running server process, JSON-RPC | Folder of markdown + optional scripts |
| Context cost at idle | Full tool schemas (or Tool Search) | ~30–50 tokens per skill (name + description) |
| Loading model | Eager | Progressive disclosure (3 levels) |
| Code execution | Yes, on the server | Yes, via bundled scripts run locally |
| External network / live state | Yes — that's the point | No (only via Bash/scripts in the skill) |
| Auth (OAuth, per-user) | Built into spec | Not native |
| Hot reload | Server-dependent | Yes (Claude Code 2.1.0+) |
| Portability | Any MCP client | Claude ecosystem (now open standard) |
| Distribution | Remote endpoints, registries | Local files, zips, plugins |
| Failure mode | Wrong tool selection, network errors | Misinterpretation of instructions |
| Best for | DBs, APIs, file IO, real-time data | Style guides, SOPs, multi-step workflows |
| Iteration speed | Restart server | Edit a markdown file |

---

## Decision rules (from the official Anthropic post, Dec 2025)

**Use Skills for:**
- Multi-step workflows that span tools (meeting prep pulling from Notion + Slack + Drive)
- Processes where consistency matters (quarterly financial analysis, compliance reviews)
- Domain expertise you want to capture and share (research methods, code-review standards)
- Institutional knowledge that should survive team churn

**Use MCP for:**
- Real-time data access (Notion search, Slack reads, DB queries)
- Actions in external systems (open GitHub issues, update Jira)
- File operations (Drive, local FS)
- API integrations to services without native Claude support

> **One-line rule:** "If you're explaining *how* to do something, that's a Skill. If you need Claude to *access* something, that's MCP."

---

## How they compose

> "Skills wrap MCP, not the other way around. The Skill defines the procedure ('read the latest 10 Salesforce contacts and summarize'); the MCP server provides the authenticated transport." — AICraftGuide

**Architecture pattern:**
- MCP servers expose Notion / Salesforce / GitHub / Postgres connectivity.
- Skill defines the *playbook*: which sources to query first, in what order, how to format, what "done" looks like.
- A skill's `allowed-tools` frontmatter pre-approves the MCP tools it depends on (e.g. `mcp__postgres__query`, `mcp__github__create_pr`).

**Conflict rule:** Keep responsibilities clean. If the MCP server says "return JSON" and the Skill says "format as markdown table," Claude has to guess. Let MCP handle connectivity; let Skills handle presentation, sequencing, workflow logic.

**Real examples Anthropic ships:**
1. *Comparable company analysis* (financial valuation) — Skill defines methodology + compliance formatting; MCP servers (S&P Capital IQ, Daloopa, Morningstar) feed live data.
2. *Notion Meeting Intelligence* — Skill defines which pages to check (project doc → prior meeting notes → stakeholder profiles) and the output structure; Notion MCP does the search/read/write.

---

## The progressive disclosure argument

The strongest technical argument for Skills (per MCPJam, Damian Galarza, Layered.dev):

- Plain MCP loads **every tool schema** for every connected server into context upfront. In practice, agents start degrading after ~2–3 large MCP servers due to tool-selection confusion and context bloat.
- Skills load **only metadata** until invoked. The full body and its references load lazily. Effectively unbounded total skill content.
- This is why some hosts (Claude Code's Tool Search, Jan 2026) retrofit progressive disclosure onto MCP too — 85–91% token reduction in some cases.

Counter-argument (MCPJam): MCP still wins on **runtime performance** (no filesystem hops to read SKILL.md), **remote distribution** (Skills ship as local zips), and **auth** (no OAuth story in Skills).

---

## Mental model cheat sheet

| Question | Answer |
|---|---|
| Connect to an external system | MCP |
| Teach a workflow / methodology | Skill |
| Expose data the user controls | MCP resource |
| Enforce always-on constraints | Rules (CLAUDE.md) |
| Explicit user-triggered action | Slash command / MCP prompt |
| Parallel isolated work | Subagent |
| One skill, many MCP servers | Yes, intended |
| Many skills, one MCP server | Yes, intended (e.g. Notion ships 4+) |
| Can a Skill replace an MCP? | No — Skills can't reach live external state |
| Can an MCP replace a Skill? | No — MCP servers shouldn't carry workflow logic |

---

## Implications for this repo (`dokploy-manager`)

This codebase is already an **MCP server** — it exposes the Dokploy API (524 endpoints / 48 grouped tools) over MCP. That's the "MCP" half of the pattern.

The natural complement would be **Skills** that encode Dokploy operational playbooks on top of these tools — e.g.:
- A "deploy-and-verify" skill that knows to call `dokploy_application.create` → `dokploy_domain.create` → `dokploy_deployment.deploy` → poll status → roll back on failure.
- A "preview-environment" skill that orchestrates `dokploy_project` + `dokploy_compose` + `dokploy_previewDeployment`.
- A "backup-rotation" skill encoding the policy for `dokploy_backup` + `dokploy_volumeBackups`.

The MCP server gives Claude the *reach* into Dokploy; Skills would give it the *playbook* for using that reach correctly.

---

## Sources

- Anthropic — *Equipping agents for the real world with Agent Skills* (Oct 16, 2025)
- Claude blog — *Extending Claude's capabilities with skills and MCP* (Dec 19, 2025)
- AICraftGuide — *Claude Skills vs MCP: Production Guide 2026*
- Skiln — *Plugins vs Skills vs MCP: A Developer's Decision Guide*
- LlamaIndex — *Skills vs MCP tools for agents: when to use what*
- MCPJam — *Progressive Disclosure Might Replace MCP*
- Damian Galarza — *MCPs vs Agent Skills*
- Layered.dev — *MCP vs Agent Skills: Capabilities and Procedures Explained*
- CometAPI — *Claude Skills vs MCP: The 2026 Guide to Agentic Architecture*
- BSWEN, Verdent, DEV.to (multiple), logdew, Subramanya, IntuitionLabs
