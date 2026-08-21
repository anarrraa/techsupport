import { defineWorkflow } from '@flue/runtime';
import * as v from 'valibot';
import reminderWriter from '../agents/reminder-writer.ts';
import { generateReminderIntro } from '../lib/reminder-intro.ts';
import { loadConfig, type AppConfig } from '../lib/config.ts';
import { fetchTickets } from '../lib/jira.ts';
import { buildReminderMessages } from '../lib/reminder-message.ts';
import { createRunJournal, type JournalSink } from '../lib/run-journal.ts';
import { selectReminderTickets } from '../lib/sla.ts';
import { postToChannel } from '../lib/teams-webhook.ts';

export interface JiraTeamsReminderOutput {
	scanned: number;
	ticketCount: number;
	messageCount: number;
	notified: boolean;
	developerCount: number;
}

interface WorkflowDependencies {
	fetchTickets: typeof fetchTickets;
	buildReminderMessages: typeof buildReminderMessages;
	postToChannel: typeof postToChannel;
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
};

export default defineWorkflow({
	agent: reminderWriter,
	output: v.object({
		scanned: v.number(),
		ticketCount: v.number(),
		messageCount: v.number(),
		notified: v.boolean(),
		developerCount: v.number(),
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
		truncated: jira.truncated,
		due: selection.due.length,
		ineligible: selection.ineligible,
		suppressedOutsideCalendar: selection.suppressedOutsideCalendar,
		waitingForNextWindow: selection.waitingForNextWindow,
	});

	if (selection.due.length === 0) {
		return {
			scanned: jira.scanned,
			ticketCount: 0,
			messageCount: 0,
			notified: false,
			developerCount,
		};
	}

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

	const messages = dependencies.buildReminderMessages(
		selection.due,
		now,
		config.reminder.maxMessageChars,
		intro.text,
	);
	if (!config.reminder.dryRun) {
		if (!config.teamsWebhookUrl) throw new Error('TEAMS_WEBHOOK_URL is required outside dry-run mode');
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

	return {
		scanned: jira.scanned,
		ticketCount: selection.due.length,
		messageCount: messages.length,
		notified: !config.reminder.dryRun,
		developerCount,
	};
}

function countBy(values: string[]): Record<string, number> {
	const counts: Record<string, number> = Object.create(null) as Record<string, number>;
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
}
