# Domain docs

Use the single-context domain-doc layout for this repository.

## Before exploring

Read these files when they exist:

- `CONTEXT.md` at the repository root
- Relevant ADRs under `docs/adr/`

Proceed silently when either path does not exist. Do not propose creating missing domain docs before they are needed. The domain-modeling workflows create them when the team resolves domain terms or architectural decisions.

## Layout

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

Use terms defined in `CONTEXT.md` when naming domain concepts in issues, proposals, hypotheses, and tests. Avoid synonyms that the glossary rejects.

If a needed concept is absent, first check whether the codebase already uses another term. Record a genuine vocabulary gap for domain modeling.

## Flag ADR conflicts

State when proposed work conflicts with an ADR:

> Contradicts ADR-0007 (event-sourced orders), but may be worth reopening because…
