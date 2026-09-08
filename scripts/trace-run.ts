/**
 * Runs the real selection and routing against live Jira and narrates every
 * stage, with names.
 *
 *   npm run trace
 *   npm run trace -- --allowlist    (apply TEAMS_BOT_RECIPIENT_ALLOWLIST)
 *
 * Sends nothing, ever. This is the counterpart to the run journal, which is
 * deliberately unable to name a request or a person because it goes to CI logs
 * (`src/lib/run-journal.ts`). This prints exactly what that cannot, so it is a
 * local tool for a human at a terminal and must not be wired into the workflow.
 *
 * Every decision below comes from the same library functions the workflow
 * calls, so what it explains is what would actually happen.
 */
import { loadConfig } from '../src/lib/config.ts';
import { planDirectMessages } from '../src/lib/direct-messages.ts';
import { dueLevel, selectEscalations, severityFor } from '../src/lib/escalation.ts';
import { loadEscalationConfig, personForJiraAccount } from '../src/lib/escalation-config.ts';
import { readEscalationState, highestNotified } from '../src/lib/escalation-state.ts';
import { fetchTickets } from '../src/lib/jira.ts';
import { elapsedMinutesOf, selectReminderTickets } from '../src/lib/sla.ts';

const applyAllowlist = process.argv.includes('--allowlist');
const config = loadConfig({ ...process.env, REMINDER_DRY_RUN: 'true' });
const now = new Date();
const stage = (n: number, title: string) => console.log(`\n${'─'.repeat(74)}\n${n}. ${title}\n${'─'.repeat(74)}`);

stage(1, 'Jira: which requests are in scope');
console.log(`JQL: ${config.jira.jql}`);
const jira = await fetchTickets(config.jira);
console.log(`\n${jira.scanned} requests scanned` + (jira.truncated ? ' (truncated by JIRA_MAX_RESULTS)' : ''));
const byPriority: Record<string, number> = {};
for (const t of jira.tickets) byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
console.log(`by priority: ${Object.entries(byPriority).map(([k, v]) => `${k}=${v}`).join('  ')}`);
console.log(`without the first-response metric: ${jira.withoutSla}`);
console.log(`without the resolution metric (no escalation clock): ${jira.withoutResolutionSla}`);
const vendorParticipants = new Set(jira.tickets.flatMap((t) => t.participants.map((p) => p.displayName)));
console.log(`\nvendor participants seen: ${vendorParticipants.size}`);
console.log('client-side participants were dropped in src/lib/jira.ts and are not visible here');

stage(2, 'First response: who is eligible for a reminder right now');
const selection = selectReminderTickets(
	jira.tickets, now, config.reminder.repeatMinutes, config.reminder.deliveryWindowMinutes,
);
console.log(`due now                : ${selection.due.length}`);
console.log(`not breached / done    : ${selection.ineligible}`);
console.log(`outside calendar hours : ${selection.suppressedOutsideCalendar}`);
console.log(`breached, awaiting its window : ${selection.waitingForNextWindow}`);
console.log(`\nA breach may produce one reminder every ${config.reminder.repeatMinutes} min, inside a ${config.reminder.deliveryWindowMinutes} min window.`);
if (selection.due.length > 0) {
	console.log('\ndue requests:');
	for (const t of selection.due) {
		console.log(`  ${t.key.padEnd(8)} ${t.priority.padEnd(8)} ${String(elapsedMinutesOf(t.firstResponseSla, now)).padStart(6)}m overdue   assignee ${t.assignee}`);
		console.log(`           participants: ${t.participants.map((p) => p.displayName).join(', ') || '(none)'}`);
	}
}

stage(3, 'Escalation: which requests crossed a contractual level');
const state = await readEscalationState(config.escalation.stateFile);
console.log(`state file: ${config.escalation.stateFile} — ${Object.keys(state).length} request(s) already recorded`);
const escalations = selectEscalations(jira.tickets, (key) => highestNotified(state, key));
console.log(`\ncrossed a level not yet notified: ${escalations.length}`);
for (const c of escalations) {
	console.log(`  ${c.ticket.key.padEnd(8)} ${c.severity.padEnd(8)} L${c.level}  ${elapsedMinutesOf(c.ticket.resolutionSla, now)}m unresolved  -> ${c.plan.levels.map((l) => 'L' + l).join(' + ')}${c.plan.surfaceOnCall ? '  + on-call' : ''}`);
}
const alreadyNotified = jira.tickets.filter((t) => {
	const s = severityFor(t.priority);
	const level = s ? dueLevel(s, elapsedMinutesOf(t.resolutionSla, now)) : null;
	return level !== null && level <= highestNotified(state, t.key);
});
if (alreadyNotified.length > 0) {
	console.log(`\nheld back because their level was already notified: ${alreadyNotified.map((t) => t.key).join(', ')}`);
}

stage(4, 'Directory: turning Jira accounts into Teams recipients');
const directory = await loadEscalationConfig(config.escalation.configFile);
console.log(`${Object.keys(directory.people).length} people in ${config.escalation.configFile}`);
console.log(`DC levels: ${Object.entries(directory.projects.DC ?? {}).map(([l, h]) => `${l}=${h}`).join('  ')}`);
for (const t of selection.due) {
	const resolved = t.participants.map((p) => {
		const person = personForJiraAccount(directory, p.accountId);
		return `${p.displayName} -> ${person ? person.name : 'NOT IN DIRECTORY'}`;
	});
	console.log(`  ${t.key}: ${resolved.join(' | ') || 'no vendor participant'}`);
}

stage(5, 'Recipients and the exact messages');
const plan = planDirectMessages({
	due: selection.due,
	escalations,
	config: directory,
	now,
	maxChars: config.reminder.maxMessageChars,
	allowlist: applyAllowlist ? config.bot?.recipientAllowlist ?? null : null,
});
console.log(`recipients: ${plan.messages.length}`);
console.log(`requests with no resolvable participant: ${plan.unmappedRecipients}`);
console.log(`withheld by the allowlist: ${plan.suppressedByAllowlist}` + (applyAllowlist ? '' : '   (allowlist not applied — pass --allowlist)'));
const nameOf = new Map(Object.values(directory.people).map((p) => [p.entraObjectId.toLowerCase(), p.name]));
for (const m of plan.messages) {
	console.log(`\n${'━'.repeat(74)}`);
	console.log(`TO: ${nameOf.get(m.entraObjectId.toLowerCase()) ?? 'UNKNOWN'}   level ${m.level}   ${m.entraObjectId}`);
	console.log(`${'━'.repeat(74)}`);
	for (const text of m.messages) console.log(text);
}

stage(6, 'What a live run would do');
console.log(`channel post : ${config.teamsWebhookUrl ? 'yes' : 'no webhook configured, skipped'}`);
console.log(`direct messages sent : ${plan.messages.reduce((n, m) => n + m.messages.length, 0)}`);
console.log(`levels recorded afterwards : ${plan.messages.flatMap((m) => m.records).map((r) => `${r.ticketKey}=L${r.level}`).join(' ') || 'none'}`);
console.log('\nThis run sent nothing.');
