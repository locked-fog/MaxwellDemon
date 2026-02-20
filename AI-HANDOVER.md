# Maxwell Demon AI Handover

note: Use Chinese to communicate with USER

## 1. Purpose

This document is the execution handover package for the next AI Agent.
Use this together with:

- `Vibe-README.md` (product and architecture baseline)
- `v0.1-scope.md` (release acceptance baseline)

Goal: allow a new Agent to continue development with minimal context rebuild.

## 2. Current Project Snapshot

- Repo root: `g:\Projects\MaxwellDemon\vibe`
- Active milestone branch: `dev/m3-graph-editor-review`
- Latest commit: `7e773f1` (`feat: complete M3 graph editor usable milestone`)
- Milestone state:
- M2: Completed
- M3: Completed (based on the updated route in `Vibe-README.md`)
- M4+: Not started

## 3. Milestone Progress Board

- M2 World map/state MVP: done
- M3 Graph editor usable: done
- M4 Sim-UI loop: pending
- M5 Cross-block logistics: pending
- M6 Save system: pending
- M7 Tech/policy effective modifiers: pending
- M8 Trade/trader/quest/contract: pending
- M9 Story T0-T4 + rebirth: pending
- M10 Content scale + release gate: pending

## 4. What Is Already Implemented

- World state/session reducer and map generation:
- `ts/src/app/state/worldLogic.ts`
- `ts/src/app/state/worldState.tsx`
- Map view, zoom/pan, block selection/unlock:
- `ts/src/features/map/MapPage.tsx`
- Graph editor foundation (React Flow):
- `ts/src/features/graph/GraphEditorPage.tsx`
- Graph local editor reducer:
- `ts/src/features/graph/state.ts`
- Graph connection rule validation:
- `ts/src/features/graph/rules.ts`
- Sim core (pure function, tested):
- `ts/src/features/sim/core.ts`

## 5. M3 Acceptance Mapping (Updated Route)

Target definition from `Vibe-README.md`:
"M3 Graph editor usable, node CRUD, edges, param editing, graph state in memory store, can manually build one valid production line."

Current status:

- Node add/delete/move/select: done
- Edge connect/delete with rule validation: done
- Parameter panel edit (node/edge): done
- Graph persisted into in-memory world store: done
- Manual valid line setup in UI: supported

## 6. Known Gaps For Next Milestone (M4 Entry Conditions)

- Sim is not yet wired into UI tick loop.
- Node runtime status and edge flow are displayed in UI model, but not yet driven by a running world tick controller.
- Save system remains scaffold-only:
- `ts/src/features/save/index.ts`

## 7. Immediate Next Work (M4 Plan)

1. Add world tick action in reducer (`tick_world` or equivalent) and run `stepBlock` on unlocked/selected scope.
2. Add runtime controls in UI: Play/Pause/Step + tick speed.
3. Feed `NodeRuntime.lastStatus` and `EdgeInstance.lastFlowPerTick` back to Graph UI every tick.
4. Add tests for reducer tick integration and deterministic update order.
5. Keep `npm run lint`, `npm run test`, `npm run build` green.

## 8. Test and Validation Baseline

Run in `ts/`:

- `npm run lint`
- `npm run test`
- `npm run build`

Current baseline: all pass on latest M3 commit.

## 9. Key Data and Contracts

- Node type schema: `ts/src/data/nodeTypes.json`
- Recipes: `ts/src/data/recipes.json`
- Resources: `ts/src/data/resources.json`
- Graph/domain types: `ts/src/types/graph.ts`
- World types: `ts/src/types/world.ts`

## 10. Handover Checklist (Use Before Every Agent Switch)

- Record current branch and latest commit hash.
- Record milestone and acceptance criterion being targeted.
- Record completed items and explicitly list pending items.
- Record exact files changed in current batch.
- Record verification commands and outcomes.
- Record known blockers/risks and reproduction steps.

## 11. Suggested Commit/PR Granularity

- One milestone sub-goal per branch (example: `dev/m4-sim-ui-loop`).
- Keep commits scoped by feature unit:
- reducer change
- UI change
- tests
- Do not mix unrelated refactors with milestone delivery.
