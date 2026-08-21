# Tech Support SLA Reminders

The language of the service contract between Zerotech and its client, as it applies to
reminding the people responsible when a support request misses its contractual first
response. Jira Service Management is the authority for every clock in this context.

## Language

### SLA and breach

**First Response SLA**:
The contractual allowance between a request being raised and the first reply to the
customer, varying by priority.
_Avoid_: response time, SLA timer, first reply target

**Breach**:
A First Response SLA cycle whose allowance has elapsed while the cycle is still running.
_Avoid_: overdue, violation, late, missed

**Calendar Hours**:
The working window the contract measures every allowance in: Mon–Fri 09:00–18:00,
excluding public holidays.
_Avoid_: business hours, office hours, working time

**Escalation Level**:
One rung of the contract's five-rung chain of people to notify while a request stays
unresolved, from the support team up to the executive.
_Avoid_: tier, severity, priority level

### Reminder delivery

**Reminder**:
One Teams message naming the breached requests, grouped by the person responsible for
each.
_Avoid_: notification, alert, digest, nag

**Delivery Window**:
The bounded period, opening once per repeat interval, during which a given breach may
produce one Reminder. Keeps a breach from being reported on every scheduled run.
_Avoid_: cooldown, throttle, debounce, rate limit

**Reminder Intro**:
The opening sentence of a Reminder: either the deterministic opener or one sentence
written by a model.
_Avoid_: greeting, preamble, header, lede

**Aggregate Counts**:
The only information a model may be given: how many requests are due, how many people
are responsible, and how many requests sit at each priority. Never anything a Jira user
can author.
_Avoid_: summary, context, prompt payload

**Intro Result**:
A Reminder Intro together with its provenance — whether a model wrote it and, when it
did not, which reason applied.
_Avoid_: response, model output, completion

### Observability

**Run Journal**:
The record of what a single scheduled run observed and decided, carrying counts and
reasons only. Never a place where a request's identity, title, or assignee can appear.
_Avoid_: log, audit trail, delivery ledger
