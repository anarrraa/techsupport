import { defineWorkflow } from '@flue/runtime';
import * as v from 'valibot';
import reminderWriter from '../agents/reminder-writer.ts';
import { loadConfig, type AppConfig } from '../lib/config.ts';
import { fetchTickets } from '../lib/jira.ts';
import { buildReminderMessages, cleanIntro } from '../lib/reminder-message.ts';
import { selectReminderTickets } from '../lib/sla.ts';
import { postToChannel } from '../lib/teams-webhook.ts';

export interface JiraTeamsReminderOutput {
	scanned: number;
	ticketCount: number;
	messageCount: number;
	notified: boolean;
	developerCount: number;
}

interface WorkflowLog {
	info(message: string): void;
	warn(message: string): void;
}

interface WorkflowDependencies {
	fetchTickets: typeof fetchTickets;
	buildReminderMessages: typeof buildReminderMessages;
	postToChannel: typeof postToChannel;
}

interface RunJiraTeamsReminderOptions {
	config: AppConfig;
	log: WorkflowLog;
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

	log.info(
		JSON.stringify({
			scanned: jira.scanned,
			withoutSla: jira.withoutSla,
			truncated: jira.truncated,
			due: selection.due.length,
			suppressedOutsideCalendar: selection.suppressedOutsideCalendar,
			waitingForNextWindow: selection.waitingForNextWindow,
		}),
	);

	if (selection.due.length === 0) {
		return {
			scanned: jira.scanned,
			ticketCount: 0,
			messageCount: 0,
			notified: false,
			developerCount,
		};
	}

	let intro: string | undefined;
	if (config.reminder.useLlmIntro) {
		try {
			if (!generateIntro) throw new Error('Reminder intro generator is unavailable');
			const priorities = countBy(selection.due.map((ticket) => ticket.priority));
			const input = JSON.stringify({
				ticketCount: selection.due.length,
				developerCount,
				priorities,
			});
			intro = cleanIntro(await withTimeout(
				(signal) => generateIntro(input, signal),
				config.http.timeoutMs,
			));
		} catch (error) {
			log.warn(`Reminder intro generation failed; using deterministic copy: ${errorName(error)}`);
		}
	}

	const messages = dependencies.buildReminderMessages(
		selection.due,
		now,
		config.reminder.maxMessageChars,
		intro,
	);
	if (!config.reminder.dryRun) {
		if (!config.teamsWebhookUrl) throw new Error('TEAMS_WEBHOOK_URL is required outside dry-run mode');
		for (const message of messages) {
			await dependencies.postToChannel(message, config.teamsWebhookUrl, config.http);
		}
	} else {
		log.info(`Dry run: skipped ${messages.length} Teams message(s).`);
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

function errorName(error: unknown): string {
	return error instanceof Error ? error.name : 'UnknownError';
}

async function withTimeout<T>(
	operation: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		const error = new Error(`Reminder intro generation timed out after ${timeoutMs}ms`);
		error.name = 'TimeoutError';
		controller.abort(error);
	}, timeoutMs);
	try {
		return await operation(controller.signal);
	} finally {
		clearTimeout(timeout);
	}
}
