import { defineWorkflow } from '@flue/runtime';
import * as v from 'valibot';
import reminderWriter from '../agents/reminder-writer.ts';
import { loadConfig } from '../lib/config.ts';
import { fetchTickets } from '../lib/jira.ts';
import { buildReminderMessages, cleanIntro } from '../lib/reminder-message.ts';
import { selectReminderTickets } from '../lib/sla.ts';
import { postToChannel } from '../lib/teams-webhook.ts';

export default defineWorkflow({
	agent: reminderWriter,
	output: v.object({
		scanned: v.number(),
		ticketCount: v.number(),
		messageCount: v.number(),
		notified: v.boolean(),
		developers: v.array(v.string()),
	}),

	async run({ harness, log }) {
		const config = loadConfig();
		const jira = await fetchTickets(config.jira);
		const now = new Date();
		const selection = selectReminderTickets(
			jira.tickets,
			now,
			config.reminder.repeatMinutes,
			config.reminder.deliveryWindowMinutes,
		);
		const developers = [...new Set(selection.due.map((ticket) => ticket.assignee))];

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
			return { scanned: jira.scanned, ticketCount: 0, messageCount: 0, notified: false, developers };
		}

		let intro: string | undefined;
		if (config.reminder.useLlmIntro) {
			try {
				const priorities = countBy(selection.due.map((ticket) => ticket.priority));
				const response = await (await harness.session()).prompt(
					JSON.stringify({ ticketCount: selection.due.length, developerCount: developers.length, priorities }),
				);
				intro = cleanIntro(response.text);
			} catch (error) {
				log.warn(`Reminder intro generation failed; using deterministic copy: ${errorName(error)}`);
			}
		}

		const messages = buildReminderMessages(
			selection.due,
			now,
			config.reminder.maxMessageChars,
			intro,
		);
		if (!config.reminder.dryRun) {
			if (!config.teamsWebhookUrl) throw new Error('TEAMS_WEBHOOK_URL is required outside dry-run mode');
			for (const message of messages) {
				await postToChannel(message, config.teamsWebhookUrl, config.http);
			}
		} else {
			log.info(`Dry run: skipped ${messages.length} Teams message(s).`);
		}

		return {
			scanned: jira.scanned,
			ticketCount: selection.due.length,
			messageCount: messages.length,
			notified: !config.reminder.dryRun,
			developers,
		};
	},
});

function countBy(values: string[]): Record<string, number> {
	const counts: Record<string, number> = Object.create(null) as Record<string, number>;
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
}

function errorName(error: unknown): string {
	return error instanceof Error ? error.name : 'UnknownError';
}
