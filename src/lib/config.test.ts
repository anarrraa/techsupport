import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from './config.ts';

test('loads validated defaults', () => {
	const config = loadConfig(baseEnv());
	assert.equal(config.jira.maxResults, 500);
	assert.equal(config.jira.maxSearchPages, 100);
	assert.equal(config.jira.maxSlaPages, 10);
	assert.equal(config.jira.firstResponseSlaName, 'Time To First Response');
	assert.equal(config.reminder.repeatMinutes, 60);
	assert.equal(config.reminder.deliveryWindowMinutes, 15);
	assert.equal(config.reminder.useLlmIntro, false);
});

test('allows dry-run mode without a Teams webhook', () => {
	const env = baseEnv();
	delete env.TEAMS_WEBHOOK_URL;
	env.REMINDER_DRY_RUN = 'true';
	assert.equal(loadConfig(env).teamsWebhookUrl, null);
});

test('rejects unsafe URLs and malformed values', () => {
	assert.throws(() => loadConfig({ ...baseEnv(), JIRA_BASE_URL: 'http://jira.local' }), /HTTPS/);
	assert.throws(() => loadConfig({ ...baseEnv(), JIRA_PAGE_SIZE: '0' }), /between 1 and 100/);
	assert.throws(
		() =>
			loadConfig({
				...baseEnv(),
				REMINDER_REPEAT_MINUTES: '30',
				REMINDER_DELIVERY_WINDOW_MINUTES: '45',
			}),
		/must not exceed/,
	);
});

function baseEnv(): NodeJS.ProcessEnv {
	return {
		JIRA_BASE_URL: 'https://example.atlassian.net',
		JIRA_EMAIL: 'support@example.com',
		JIRA_API_TOKEN: 'test-token',
		TEAMS_WEBHOOK_URL: 'https://example.webhook.office.com/test',
	};
}
