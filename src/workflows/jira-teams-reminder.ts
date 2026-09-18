import { defineWorkflow } from '@flue/runtime';
import * as v from 'valibot';
import reminderWriter from '../agents/reminder-writer.ts';
import { generateReminderIntro } from '../lib/reminder-intro.ts';
import { loadConfig, type AppConfig } from '../lib/config.ts';
import { windowDecision } from '../lib/delivery-windows.ts';
import { planDirectMessages } from '../lib/direct-messages.ts';
import {
	dueLevel,
	selectEscalations,
	severityFor,
	type EscalationCandidate,
} from '../lib/escalation.ts';
import { loadEscalationConfig, type EscalationConfig } from '../lib/escalation-config.ts';
import {
	highestNotified,
	readEscalationState,
	recordNotified,
	writeEscalationState,
	type EscalationState,
} from '../lib/escalation-state.ts';
import { fetchTickets, type JiraTicket } from '../lib/jira.ts';
import { buildReminderMessages, type TicketDigests } from '../lib/reminder-message.ts';
import {
	buildTicketDigests,
	resolveTicketOwner,
	toDigestView,
	type DigestReason,
	type DigestTicketView,
	type TicketDigest,
	type TicketOwner,
} from '../lib/ticket-digest.ts';
import {
	createRunJournal,
	type DigestsObserved,
	type DirectMessagesObserved,
	type EscalationObserved,
	type JournalSink,
	type RunJournal,
} from '../lib/run-journal.ts';
import { elapsedSinceRaisedMinutes, selectReminderTickets } from '../lib/sla.ts';
import { createBotSender, TeamsDeliveryError } from '../lib/teams-bot.ts';
import { postToChannel } from '../lib/teams-webhook.ts';

export interface JiraTeamsReminderOutput {
	scanned: number;
	ticketCount: number;
	messageCount: number;
	notified: boolean;
	developerCount: number;
	/** Direct messages delivered, or that would have been, in dry-run. */
	directMessageCount: number;
	/** Requests that crossed a new contractual escalation level this run. */
	escalationCount: number;
}

/**
 * The digest seam (`src/lib/ticket-digest.ts`): deterministic owner resolution
 * in, one or two sentences of prose out. The model half lives behind it, so the
 * workflow neither prompts nor parses.
 */
type BuildTicketDigests = (
	views: DigestTicketView[],
	owners: Map<string, TicketOwner>,
	options: {
		enabled: boolean;
		timeoutMs: number;
		generate?: (input: string, signal: AbortSignal) => Promise<string>;
	},
) => Promise<Map<string, TicketDigest>>;

interface WorkflowDependencies {
	fetchTickets: typeof fetchTickets;
	buildTicketDigests: BuildTicketDigests;
	buildReminderMessages: typeof buildReminderMessages;
	postToChannel: typeof postToChannel;
	loadEscalationConfig: typeof loadEscalationConfig;
	readEscalationState: typeof readEscalationState;
	writeEscalationState: typeof writeEscalationState;
	createBotSender: typeof createBotSender;
}

interface RunJiraTeamsReminderOptions {
	config: AppConfig;
	log: JournalSink;
	now?: Date;
	generateIntro?: (input: string, signal: AbortSignal) => Promise<string>;
	generateDigest?: (input: string, signal: AbortSignal) => Promise<string>;
	dependencies?: Partial<WorkflowDependencies>;
}

const defaultDependencies: WorkflowDependencies = {
	fetchTickets,
	buildTicketDigests,
	buildReminderMessages,
	postToChannel,
	loadEscalationConfig,
	readEscalationState,
	writeEscalationState,
	createBotSender,
};

export default defineWorkflow({
	agent: reminderWriter,
	output: v.object({
		scanned: v.number(),
		ticketCount: v.number(),
		messageCount: v.number(),
		notified: v.boolean(),
		developerCount: v.number(),
		directMessageCount: v.number(),
		escalationCount: v.number(),
	}),

	async run({ harness, log }) {
		return runJiraTeamsReminder({
			config: loadConfig(),
			log,
			generateIntro: async (input, signal) => {
				const response = await (await harness.session()).prompt(input, { signal });
				return response.text;
			},
			// The prompt itself belongs to the digest seam, not here; this only
			// hands it a way to reach the model.
			generateDigest: async (input, signal) => {
				const response = await (await harness.session()).prompt(input, { signal });
				return response.text;
			},
		});
	},
});

export async function runJiraTeamsReminder(
	options: RunJiraTeamsReminderOptions,
): Promise<JiraTeamsReminderOutput> {
	const { config, log, generateIntro, generateDigest } = options;
	const dependencies = { ...defaultDependencies, ...options.dependencies };
	const jira = await dependencies.fetchTickets(config.jira);
	const now = options.now ?? new Date();
	const selection = selectReminderTickets(
		jira.tickets,
		now,
		config.reminder.repeatMinutes,
		config.reminder.deliveryWindowMinutes,
	);
	const developerCount = new Set(selection.due.map((ticket) => ticket.assignee)).size;

	const journal = createRunJournal(log);
	journal.selection({
		scanned: jira.scanned,
		withoutSla: jira.withoutSla,
		withoutResolutionSla: jira.withoutResolutionSla,
		truncated: jira.truncated,
		due: selection.due.length,
		ineligible: selection.ineligible,
		suppressedOutsideCalendar: selection.suppressedOutsideCalendar,
		waitingForNextWindow: selection.waitingForNextWindow,
	});

	// A run that GitHub started at three in the morning must not wake anyone.
	// The schedule decides when a run happens; this decides whether it delivers,
	// which is the only half of it GitHub cannot make late.
	const window = windowDecision(now, {
		windows: config.reminder.windows,
		timeZone: config.reminder.timeZone,
	});
	journal.window(window);

	if (jira.scanned === 0 && !config.reminder.dryRun) {
		throw new Error(
			'Jira search returned 0 issues — check JIRA_JQL configuration',
		);
	}

	// The channel post needs a webhook; without one the bot transport carries the
	// run on its own and the aggregate-only model intro is never requested.
	// Dry-run still reports, at any hour, so the trace and a manual check work
	// outside working time.
	const mayDeliver = window.deliver || config.reminder.dryRun;

	// Resolved before either transport renders, because the escalation candidates
	// are half of what the digests cover.
	const bot = mayDeliver ? await prepareBotDelivery({ config, dependencies, journal, jira }) : null;
	// One digest per request for the whole run, over the union of what the channel
	// post and the direct messages will render: a request in both is described
	// the same way in both, and costs one model call rather than two.
	const digests = mayDeliver
		? await buildDigests({
			config,
			dependencies,
			journal,
			now,
			generate: generateDigest,
			escalationConfig: bot?.escalationConfig ?? null,
			tickets: unique([...selection.due, ...(bot?.escalations ?? []).map((c) => c.ticket)]),
		})
		: new Map<string, TicketDigest>();

	let messages: string[] = [];
	if (mayDeliver && selection.due.length > 0 && config.teamsWebhookUrl) {
		const intro = await generateReminderIntro({
			ticketCount: selection.due.length,
			developerCount,
			priorities: countBy(selection.due.map((ticket) => ticket.priority)),
		}, {
			enabled: config.reminder.useLlmIntro,
			timeoutMs: config.reminder.introTimeoutMs,
			generate: generateIntro,
		});
		journal.intro(intro);

		messages = dependencies.buildReminderMessages(
			selection.due,
			now,
			config.reminder.maxMessageChars,
			intro.text,
			digests,
		);
		if (!config.reminder.dryRun) {
			let delivered = 0;
			try {
				for (const message of messages) {
					await dependencies.postToChannel(message, config.teamsWebhookUrl, config.http);
					delivered += 1;
				}
			} finally {
				// Reported even when a send throws, so a partial delivery is visible.
				journal.delivery({ messages: messages.length, delivered, dryRun: false });
			}
		} else {
			journal.delivery({ messages: messages.length, dryRun: true });
		}
	}

	const delivery = bot
		? await runBotDelivery({
			config,
			dependencies,
			journal,
			context: bot,
			due: selection.due,
			now,
			digests,
		})
		: { directMessageCount: 0, escalationCount: 0 };

	return {
		scanned: jira.scanned,
		ticketCount: selection.due.length,
		messageCount: messages.length,
		notified:
			!config.reminder.dryRun && (messages.length > 0 || delivery.directMessageCount > 0),
		developerCount,
		directMessageCount: delivery.directMessageCount,
		escalationCount: delivery.escalationCount,
	};
}

/** Everything the escalation half of the run needs, resolved once. */
interface BotContext {
	escalationConfig: EscalationConfig;
	state: EscalationState;
	escalations: EscalationCandidate[];
	tickets: JiraTicket[];
}

/**
 * The escalation clock, read before anything is rendered. Skipped entirely when
 * the bot is not configured, so the channel reminder keeps working on its own.
 */
async function prepareBotDelivery(input: {
	config: AppConfig;
	dependencies: WorkflowDependencies;
	journal: RunJournal;
	jira: { tickets: JiraTicket[]; withoutResolutionSla: number; withoutParticipants: number };
}): Promise<BotContext | null> {
	const { config, dependencies, journal, jira } = input;
	const tickets = jira.tickets;
	if (!config.bot) return null;
	if (tickets.length > 0 && jira.withoutResolutionSla === tickets.length) {
		throw new Error(
			`JSM SLA metric "${config.jira.resolutionSlaName}" drives the escalation clock but `
				+ `was not found on any of ${tickets.length} Jira tickets`,
		);
	}
	// First-response reminders route through participants alone, so this field
	// now carries the same weight for delivery as the SLA metric does, and gets
	// the same fail-visibly treatment (`AGENTS.md`). A renamed custom field
	// would otherwise report "Delivered 0 direct message(s)" and exit 0.
	if (tickets.length > 0 && jira.withoutParticipants === tickets.length) {
		throw new Error(
			`No Jira ticket carries a vendor participant in field "${config.jira.participantsField}" `
				+ `across all ${tickets.length} scanned tickets — check JIRA_PARTICIPANTS_FIELD`,
		);
	}

	const escalationConfig = await dependencies.loadEscalationConfig(config.escalation.configFile);
	const state = await dependencies.readEscalationState(config.escalation.stateFile);
	const escalations = selectEscalations(tickets, (key) => highestNotified(state, key));
	// Built key by key rather than through countBy, whose Record<string, number>
	// would satisfy the journal's narrow type and reopen the hole it closes.
	const byLevel: EscalationObserved['byLevel'] = {};
	for (const candidate of escalations) {
		const key = String(candidate.level) as '2' | '3' | '4' | '5';
		byLevel[key] = (byLevel[key] ?? 0) + 1;
	}
	journal.escalation({ candidates: escalations.length, byLevel });
	return { escalationConfig, state, escalations, tickets };
}

interface BotDeliveryInput {
	config: AppConfig;
	dependencies: WorkflowDependencies;
	journal: RunJournal;
	context: BotContext;
	due: JiraTicket[];
	now: Date;
	digests: TicketDigests;
}

/**
 * The personal-bot transport: a first-response reminder to each breaching
 * participant, plus the contract's L2-L5 escalation for requests that stay
 * unresolved.
 */
async function runBotDelivery(
	input: BotDeliveryInput,
): Promise<{ directMessageCount: number; escalationCount: number }> {
	const { config, dependencies, journal, due, now, digests } = input;
	const { escalationConfig, state, escalations, tickets } = input.context;
	if (!config.bot) return { directMessageCount: 0, escalationCount: 0 };

	if (config.reminder.escalationSeedOnly) {
		if (config.reminder.dryRun) {
			throw new Error('ESCALATION_SEED_ONLY writes state, so it cannot run with REMINDER_DRY_RUN');
		}
		// Seeding records the **highest** mark already behind each request, not
		// the next rung. Ordinary runs step one level at a time, so seeding with
		// the next rung would hand out the whole backlog one level per run
		// instead of suppressing it, which is the opposite of what this is for.
		for (const ticket of tickets) {
			const severity = severityFor(ticket.priority);
			if (!severity) continue;
			const highest = dueLevel(severity, elapsedSinceRaisedMinutes(ticket.resolutionSla));
			if (highest !== null) recordNotified(state, ticket.key, highest);
		}
		await dependencies.writeEscalationState(config.escalation.stateFile, state);
		// The escalation event above already reported what was recorded; nothing
		// was addressed to anyone, so there is no delivery to journal.
		return { directMessageCount: 0, escalationCount: escalations.length };
	}

	const plan = planDirectMessages({
		due,
		escalations,
		config: escalationConfig,
		now,
		maxChars: config.reminder.maxMessageChars,
		allowlist: config.bot.recipientAllowlist,
		digests,
	});
	const totalMessages = plan.messages.reduce((total, planned) => total + planned.messages.length, 0);
	const observed = {
		recipients: plan.messages.length,
		messages: totalMessages,
		unmappedRecipients: plan.unmappedRecipients,
		missingOnCall: plan.missingOnCall,
		suppressedByAllowlist: plan.suppressedByAllowlist,
	};

	if (config.reminder.dryRun) {
		journal.directMessages({ ...observed, delivered: 0, dryRun: true, failures: {} });
		return { directMessageCount: totalMessages, escalationCount: escalations.length };
	}

	const sender = await dependencies.createBotSender(config.bot);
	const failures: DirectMessagesObserved['failures'] = {};
	// A level is notified only when every leg carrying it was delivered. The
	// off-hours rule sends one candidate to several people, and recording the
	// level from whichever leg happened to succeed marked it notified for the
	// contact who never received it — losing that rung permanently.
	const delivered_ = new Set<string>();
	const failedTickets = new Set<string>(plan.incompleteEscalations);
	let firstFailure: unknown;
	let delivered = 0;
	try {
		for (const planned of plan.messages) {
			try {
				for (const text of planned.messages) {
					await sender.send({ entraObjectId: planned.entraObjectId, text });
					delivered += 1;
				}
				for (const record of planned.records) delivered_.add(record.ticketKey);
			} catch (error) {
				const reason = error instanceof TeamsDeliveryError ? error.reason : 'other';
				failures[reason] = (failures[reason] ?? 0) + 1;
				firstFailure ??= error;
				// Any failed leg makes the whole level unrecorded, so the contact
				// who was missed is reached next run.
				for (const record of planned.records) failedTickets.add(record.ticketKey);
			}
		}
	} finally {
		for (const planned of plan.messages) {
			for (const record of planned.records) {
				if (delivered_.has(record.ticketKey) && !failedTickets.has(record.ticketKey)) {
					recordNotified(state, record.ticketKey, record.level);
				}
			}
		}
		await dependencies.writeEscalationState(config.escalation.stateFile, state);
		journal.directMessages({ ...observed, delivered, dryRun: false, failures });
	}

	const failed = Object.values(failures).reduce((total, count) => total + count, 0);
	if (failed > 0) {
		throw new Error(`${failed} of ${plan.messages.length} direct-message recipient(s) failed`, {
			cause: firstFailure,
		});
	}
	return { directMessageCount: delivered, escalationCount: escalations.length };
}

/**
 * Build one digest per request, then report counts. Never throws and never
 * blocks the reminder: the seam degrades to its deterministic sentence, and a
 * run with no escalation directory renders the plain rows it renders today.
 */
async function buildDigests(input: {
	config: AppConfig;
	dependencies: WorkflowDependencies;
	journal: RunJournal;
	now: Date;
	generate?: (input: string, signal: AbortSignal) => Promise<string>;
	escalationConfig: EscalationConfig | null;
	tickets: JiraTicket[];
}): Promise<TicketDigests> {
	const { config, dependencies, journal, now, escalationConfig, tickets } = input;
	if (tickets.length === 0) return new Map();
	// Owner resolution reads the directory's `jiraAccountId` values, so without a
	// directory there is nobody to name and no digest to render.
	if (!escalationConfig) {
		journal.digests({
			tickets: tickets.length,
			model: 0,
			fallback: 0,
			reasons: { missing: tickets.length },
		});
		return new Map();
	}

	const owners = new Map(
		tickets.map((ticket) => [ticket.key, resolveTicketOwner(ticket, escalationConfig, now)]),
	);
	const views = tickets.map((ticket) =>
		toDigestView(
			ticket,
			escalationConfig,
			now,
			elapsedSinceRaisedMinutes(ticket.resolutionSla),
		),
	);
	const digests = await dependencies.buildTicketDigests(views, owners, {
		enabled: config.reminder.useLlmDigest,
		timeoutMs: config.reminder.digestTimeoutMs,
		generate: input.generate,
	});

	const reasons: DigestsObserved['reasons'] = {};
	let model = 0;
	for (const digest of digests.values()) {
		if (digest.source === 'model') model += 1;
		if (digest.reason) reasons[digest.reason] = (reasons[digest.reason] ?? 0) + 1;
	}
	const missing = tickets.length - digests.size;
	if (missing > 0) reasons.missing = (reasons.missing ?? 0) + missing;
	journal.digests({
		tickets: tickets.length,
		model,
		fallback: digests.size - model,
		reasons,
	});
	return digests;
}

function unique(tickets: JiraTicket[]): JiraTicket[] {
	return [...new Map(tickets.map((ticket) => [ticket.key, ticket])).values()];
}

function countBy(values: string[]): Record<string, number> {
	const counts: Record<string, number> = Object.create(null) as Record<string, number>;
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
}
