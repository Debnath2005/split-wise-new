---
name: build-milestone
description: Build one SPEC.md milestone end to end. Reads the milestone and relevant ADRs, gets plan approval, builds, verifies, waits for the user's phone check, then commits.
argument-hint: <milestone-id, e.g. M3>
disable-model-invocation: true
---

# Build milestone $ARGUMENTS

Follow these steps in order. **Never skip a "wait" step.** Each one ends your turn until the user replies.

## 1. Load context
- If `$ARGUMENTS` is empty or doesn't match a `### Mx:` heading in `SPEC.md` §15, list the available milestones and stop.
- Read the `$ARGUMENTS` section of `SPEC.md` §15, including its Definition of Done. Also read every SPEC section it touches (data model, API, UI, money rules…).
- Read `docs/adr/README.md`, then every ADR relevant to this milestone in full.
- Read `CLAUDE.md`. If the milestone has UI, read `DESIGN.md` and check what's in `client/src/components/ui`.
- Check that earlier milestones look done (their code exists). If not, say so and ask whether to continue.

## 2. Plan, then wait for approval
Present a short plan:
- **Scope**: what will be built, mapped to the milestone bullets and DoD.
- **Files**: new or changed files and migrations.
- **ADRs followed**: which ones apply and how.
- **Tests**: what will be covered (money math gets unit tests in `shared/src/lib/money`).
- **Questions**: anything not in SPEC.md, anything ambiguous, and any conflict with an accepted ADR. These must be answered before building, never assumed.

Then **stop and wait for the user to approve.** If they change the plan, revise it and wait again.

## 3. Build
- Implement only the approved plan. If something comes up that isn't in SPEC.md, or that contradicts an accepted ADR, stop and ask.
- Follow the CLAUDE.md rules: TypeScript strict, integer paise only, money math only in `shared/src/lib/money`, UI only from `client/src/components/ui`.

## 4. Verify
- Run the tests, lint and build (use the scripts in `package.json`).
- Fix every failure and rerun until all three pass. Don't weaken or skip tests to make them pass.

## 5. Report, then wait for confirmation
Report:
- The test, lint and build results (pass counts, and any warnings).
- How each DoD item is met.
- **Phone checks**: a numbered list of exact steps to try on a phone (URL, taps, inputs, expected result), including edge cases such as rounding remainders, validation errors, narrow screens and the keyboard covering inputs. Also say how to open the dev server from a phone on the same network.

Then **stop and wait.** Don't commit.
- If the user reports a problem: fix it and go back to step 4.
- If the user confirms it works: go to step 6.

## 6. Commit (only after explicit confirmation)
- Run step 4 one more time. Never commit failing tests or a broken build.
- If the directory isn't a git repo, ask before running `git init`.
- Stage only this milestone's files and commit with a clear message, for example `M3: expenses with equal/exact/percent splits`, with a body summarizing what was built.
- Show the commit hash and summary.
