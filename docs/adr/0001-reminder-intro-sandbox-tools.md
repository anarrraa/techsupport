---
status: accepted
---

# Leave the Reminder Intro agent's sandbox tools unrestricted for now

The agent that writes the Reminder Intro runs in the framework's default sandbox, which
hands the model filesystem and shell tools and permits unrestricted outbound network
access. We are not narrowing that tool set yet, because the model's entire input is
Aggregate Counts — three integers — so there is no attacker-controlled text that could
drive the tools, while opting out means implementing a nine-method sandbox adapter
against a beta interface whose own bundled documentation already disagrees with its
shipped code.

## Trigger for revisiting

The first time any request-derived text reaches a model prompt. The proposed personal
Teams bot contemplates model-written escalation copy; if that lands, unrestricted network
access plus shell becomes a real exfiltration path and this decision must be reversed
before that feature ships. Treat it as a precondition on that work, not a follow-up.

## Considered options

- **Restrict now.** Rejected: buys a bespoke adapter against a moving beta surface to
  close a risk that has no input to exploit.
- **Never restrict.** Rejected: the trigger above is foreseeable, not hypothetical.
- **Defer with a recorded trigger.** Chosen.

## Consequences

The tools act on a virtual in-memory filesystem, not the repository checkout, so no
secret or source file is reachable through them today. What remains is outbound network
from a model turn. Anyone reading the agent definition and wondering why a
sentence-writing model can run shell commands should find this file first.
