# Clean Code heuristics (AA protocol)

Derived from *Clean Code* (Robert C. Martin) as **review heuristics**, not moral absolutes. Product-specific bans stay in the tenant repo.

## Anti-dogma (do not ticket)

- Function/class **line count alone** (e.g. “>20 lines”).
- **Premature DRY** / shared abstraction when call sites will diverge.
- “Comments are always bad” — keep intent/warning/why comments.
- Style/format that mechanical `command` already covers (ruff/eslint) unless opacity remains.
- Speculative rewrite or architecture redesign as the “fix”.

Require **impact**: harder to change, fragile under edit, opaque to the next reader, or missing safety net (tests/boundaries).

## Catalog (`smell_id` → look for)

### Names — `name.*`

| id | Look for |
|----|----------|
| `name.opaque` | Names that hide intent; abbreviations without domain currency |
| `name.noise` | Meaningless distinctions (`data1`/`data2`, `a`/`b` in wide scope) |
| `name.magic` | Magic numbers/strings without named constants |

### Functions — `fn.*`

| id | Look for |
|----|----------|
| `fn.mixed_abstraction` | High-level orchestration mixed with low-level detail in one block |
| `fn.side_effects` | Surprising mutation/I/O under a query-like name |
| `fn.flag_arg` | Boolean flag selecting unrelated behaviors (split candidates) |
| `fn.too_many_args` | Long param lists that should be a small struct/options object |

### Comments / noise — `cmt.*`

| id | Look for |
|----|----------|
| `cmt.redundant` | Comments restating obvious code |
| `cmt.dead` | Commented-out code left in tree |
| `cmt.missing_why` | Non-obvious business/invariant with no explanation |

### Structure — `struct.*`

| id | Look for |
|----|----------|
| `struct.scatter` | Related logic split without reason; unrelated blocks interleaved |
| `struct.density` | Variables declared far from use; hard vertical scan |

### Objects / data — `obj.*`

| id | Look for |
|----|----------|
| `obj.hybrid` | Half DTO / half behavior with unclear ownership |
| `obj.leaky` | Callers depend on internal structure (Law of Demeter smells) |
| `obj.god` | Module owns many unrelated responsibilities (SRP breach with impact) |

### Errors / boundaries — `err.*` / `bound.*`

| id | Look for |
|----|----------|
| `err.null_return` | Null/optional returns that force scattered checks |
| `err.swallowed` | Empty catch / logged-and-ignored failures |
| `bound.raw` | External API/DB shapes leaking deep into core logic |

### Tests — `test.*`

| id | Look for |
|----|----------|
| `test.missing` | Critical prod path with no nearby tests |
| `test.coupled` | Tests that require heavy shared mutable fixtures / order dependence |
| `test.opaque` | Assertions that do not state behavior (FIRST: Fast, Independent, Repeatable, Self-validating, Timely) |

### Design smells — `design.*`

| id | Look for |
|----|----------|
| `design.rigidity` | Small change fans out across many modules |
| `design.fragility` | Unrelated areas break when one area changes |
| `design.opacity` | Hard to understand without tribal knowledge |
| `design.needless_complexity` | Abstraction layers with no current payoff |
| `design.needless_repetition` | True duplication of knowledge (not coincidental similar code) |

## Boy Scout bound

Ticket suggests the **smallest** next patch that improves the smell (rename, extract one function, add one test, wrap one boundary). No “rewrite module X” as the only ask.
