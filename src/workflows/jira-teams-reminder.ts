import { defineWorkflow } from '@flue/runtime';
import * as v from 'valibot';
import reminderWriter from '../agents/reminder-writer.ts';
import { generateReminderIntro } from '../lib/reminder-intro.ts';
import { loadConfig, type AppConfig } from '../lib/config.ts';
import { planDirectMessages } from '../lib/direct-messages.ts';
import { selectEscalations } from '../lib/escalation.ts';
import { loadEscalationConfig } from '../lib/escalation-config.ts';
import {
	highestNotified,
	readEscalationState,
	recordNotified,
	writeEscalationState,
} from '../lib/escalation-state.ts';
import { fetchTickets, type JiraTicket } from '../lib/jira.ts';
import { buildReminderMessages } from '../lib/reminder-message.ts';
import { createRunJournal, type JournalSink, type RunJournal } from '../lib/run-journal.ts';
import { selectReminderTickets } from '../lib/sla.ts';
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

interface WorkflowDependencies {
	fetchTickets: typeof fetchTickets;
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
	dependencies?: Partial<WorkflowDependencies>;
}

const defaultDependencies: WorkflowDependencies = {
	fetchTickets,
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
		});
	},
});

export async function runJiraTeamsReminder(
	options: RunJiraTeamsReminderOptions,
): Promise<JiraTeamsReminderOutput> {
	const { config, log, generateIntro } = options;
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

	if (jira.scanned === 0 && !config.reminder.dryRun) {
		throw new Error(
			'Jira search returned 0 issues — check JIRA_JQL configuration',
		);
	}

	// The channel post needs a webhook; without one the bot transport carries the
	// run on its own and the aggregate-only model intro is never requested.
	let messages: string[] = [];
	if (selection.due.length > 0 && config.teamsWebhookUrl) {
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

	const bot = await runBotDelivery({
		config,
		dependencies,
		journal,
		tickets: jira.tickets,
		withoutResolutionSla: jira.withoutResolutionSla,
		due: selection.due,
		now,
	});

	return {
		scanned: jira.scanned,
		ticketCount: selection.due.length,
		messageCount: messages.length,
		notified:
			!config.reminder.dryRun && (messages.length > 0 || bot.directMessageCount > 0),
		developerCount,
		directMessageCount: bot.directMessageCount,
		escalationCount: bot.escalationCount,
	};
}

interface BotDeliveryInput {
	config: AppConfig;
	dependencies: WorkflowDependencies;
	journal: RunJournal;
	tickets: JiraTicket[];
	withoutResolutionSla: number;
	due: JiraTicket[];
	now: Date;
}

/**
 * The personal-bot transport: a first-response reminder to each breaching
 * assignee, plus the contract's L2-L5 escalation for requests that stay
 * unresolved. Skipped entirely when the bot is not configured, so the channel
 * reminder keeps working on its own.
 */
async function runBotDelivery(
	input: BotDeliveryInput,
): Promise<{ directMessageCount: number; escalationCount: number }> {
	const { config, dependencies, journal, tickets, due, now } = input;
	if (!config.bot) return { directMessageCount: 0, escalationCount: 0 };
	if (tickets.length > 0 && input.withoutResolutionSla === tickets.length) {
		throw new Error(
			`JSM SLA metric "${config.jira.resolutionSlaName}" drives the escalation clock but `
				+ `was not found on any of ${tickets.length} Jira tickets`,
		);
	}

	const escalationConfig = await dependencies.loadEscalationConfig(config.escalation.configFile);
	const state = await dependencies.readEscalationState(config.escalation.stateFile);
	const escalations = selectEscalations(tickets, (key) => highestNotified(state, key));
	journal.escalation({
		candidates: escalations.length,
		byLevel: countBy(escalations.map((candidate) => String(candidate.level))),
	});

	if (config.reminder.escalationSeedOnly) {
		if (config.reminder.dryRun) {
			throw new Error('ESCALATION_SEED_ONLY writes state, so it cannot run with REMINDER_DRY_RUN');
		}
		for (const candidate of escalations) {
			recordNotified(state, candidate.ticket.key, candidate.level);
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
	});
	const totalMessages = plan.messages.reduce((total, planned) => total + planned.messages.length, 0);
	const observed = {
		recipients: plan.messages.length,
		messages: totalMessages,
		unmappedAssignees: plan.unmappedAssignees,
		missingOnCall: plan.missingOnCall,
	};

	if (config.reminder.dryRun) {
		journal.directMessages({ ...observed, delivered: 0, dryRun: true, failures: {} });
		return { directMessageCount: totalMessages, escalationCount: escalations.length };
	}

	const sender = await dependencies.createBotSender(config.bot);
	const failures: Record<string, number> = {};
	let firstFailure: unknown;
	let delivered = 0;
	try {
		for (const planned of plan.messages) {
			try {
				for (const text of planned.messages) {
					await sender.send({ entraObjectId: planned.entraObjectId, text });
					delivered += 1;
				}
				// Only a fully delivered notification counts as notified, so a failure
				// retries next run rather than silently skipping a contractual level.
				for (const record of planned.records) {
					recordNotified(state, record.ticketKey, record.level);
				}
			} catch (error) {
				const reason = error instanceof TeamsDeliveryError ? error.reason : 'other';
				failures[reason] = (failures[reason] ?? 0) + 1;
				firstFailure ??= error;
			}
		}
	} finally {
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

function countBy(values: string[]): Record<string, number> {
	const counts: Record<string, number> = Object.create(null) as Record<string, number>;
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
}
