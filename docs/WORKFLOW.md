# Agent Workflow

This document is the detailed setup and task-routing reference. The root [AGENTS.md](../AGENTS.md) holds short repository rules; app and package `AGENTS.md` files add local constraints.

## Document ownership

| Question | Authority |
| --- | --- |
| Who owns work, authorization, and delegation? | Root and scoped `AGENTS.md` |
| What behavior is supported? | [PRODUCT.md](../PRODUCT.md) |
| Which layer owns behavior or data flow? | [ARCHITECTURE.md](../ARCHITECTURE.md) |
| What should the interface look and feel like? | [DESIGN.md](../DESIGN.md) |
| How should code be structured? | [CODING.md](CODING.md) |
| Which checks provide evidence? | [TESTING.md](TESTING.md) |
| How do I run a client? | Its `README.md` |

Honor the user's direct instructions and authorization first. Use operational rules from `AGENTS.md`, product facts from `PRODUCT.md`, and keep each technical concern in its owner document. The implementation is evidence of current behavior; it does not authorize changing an approved product or architecture contract. Surface a material discrepancy before changing that contract, then update the owner document when the direction is approved.

## Roles and handoff

Before defining scope for every task, the primary applies `grill-me`, including for small tasks. Ask one question at a time and give a recommended answer. Inspect the repository to answer codebase questions; do not invent questions. Stop when goal, boundaries, and acceptance are settled. Reuse settled answers during the task instead of restarting the interview.

The primary reads repository and scoped instructions, owns scope and product/design direction, defines the exact contract and affected paths, delegates code implementation and repairs to the Luna max `implementer`, then reviews the diff and owns integration and final verification. Prefer the named agent when supported; otherwise explicitly use a `gpt-6-luna` worker at max reasoning with the same bounded brief. Report a blocker only if Luna max delegation itself is unavailable. The worker does not delegate recursively or change models. Discuss broad refactors with the user before implementation. After repeated implementation failure, the primary diagnoses and rebriefs; discuss model escalation before changing the implementer.

### Waiting for delegated work

Use Codex's native wait-for-agent or completion-event mechanism when available (for example, `wait_agent` or `wait_for_subagents`). Do not wait with fixed sleeps or repeatedly poll status. While waiting, continue only useful independent work; otherwise wait for the completion event. After the worker completes, review its report and diff, then run the required checks.

Give the implementer a short, concrete brief:

```text
Objective:
Evidence and relevant paths:
Files owned by the worker:
Constraints and contracts:
Acceptance criteria:
Required automated checks:
Reporting needs:
```

For a small task, keep the brief short and name the acceptance checks. For substantial work, split implementation into reviewable slices and preserve ownership across shared packages and clients. Ask about choices only when they materially change a contract or scope.

## Global Codex setup

- `~/.codex/AGENTS.md` supplies universal instructions. Repo and scoped `AGENTS.md` files add instructions for their paths.
- `~/.codex/agents/implementer.toml` defines the named `implementer` subagent. It uses `gpt-6-luna` with max reasoning. The global `~/.codex/config.toml` enables agents and sets the same Luna max default; the primary model remains the user's existing setting.
- After changing global or repository instruction files, start a new Codex task/run to check the assembled instructions. Use `codex debug prompt-input` to inspect the model-visible instruction chain; this does not confirm which custom subagent model was selected. Validate the standalone agent TOML fields and `[agents]` defaults separately. If prompt inspection is unavailable in a launch surface, report that setup verification as unavailable rather than assuming the files loaded.
- OpenAI references: [AGENTS.md discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), and [progressive skill disclosure](https://learn.chatgpt.com/docs/build-skills).

## Skills and checks

Use `grill-me` for the scoping stage, then choose the relevant task workflow and distinct specialists whose triggers apply. For UI work, intent discovery, design, audit, and review stages may each apply; a wrapper and its underlying skill are one workflow, not duplicate reviews. Read focused instructions progressively and reuse settled intent answers. Repository and user instructions take precedence, including the policy that browser and simulator checks run only when explicitly requested or required by acceptance criteria.

Use [TESTING.md](TESTING.md) for change-specific automated checks. Browser or simulator checks run only when explicitly requested or explicitly required by task acceptance criteria. Supabase schema/data edits may use the connected MCP under the repo rule; production-backed tests still need explicit approval and disposable fixtures.
