/**
 * Proves the Bot Connector delivery path end to end before the scheduled
 * workflow depends on it.
 *
 *   node scripts/verify-teams-bot.ts <entra-object-id>
 *
 * Reads TEAMS_BOT_APP_ID, TEAMS_BOT_TENANT_ID and either TEAMS_BOT_APP_PASSWORD
 * or the GitHub OIDC runner variables. Prints outcomes only: no token, secret,
 * or recipient identifier is written to the output.
 */
import type { TeamsBotConfig } from '../src/lib/config.ts';
import { createBotSender, TeamsDeliveryError } from '../src/lib/teams-bot.ts';

const recipient = process.argv[2]?.trim();
if (!recipient) {
	console.error('Usage: node scripts/verify-teams-bot.ts <entra-object-id>');
	process.exit(2);
}

const appId = process.env.TEAMS_BOT_APP_ID?.trim();
const tenantId = process.env.TEAMS_BOT_TENANT_ID?.trim();
if (!appId || !tenantId) {
	console.error('Set TEAMS_BOT_APP_ID and TEAMS_BOT_TENANT_ID first');
	process.exit(2);
}

const config: TeamsBotConfig = {
	appId,
	tenantId,
	appPassword: process.env.TEAMS_BOT_APP_PASSWORD?.trim() || null,
	serviceUrl:
		process.env.TEAMS_BOT_SERVICE_URL?.trim() || 'https://smba.trafficmanager.net/teams/',
	http: { timeoutMs: 15_000, maxRetries: 1 },
};

try {
	const sender = await createBotSender(config);
	console.log('Bot Framework token acquired');
	await sender.send({
		entraObjectId: recipient,
		text: 'Delivery check from the SLA reminder workflow. No action needed.',
	});
	console.log('Direct message delivered');
} catch (error) {
	if (error instanceof TeamsDeliveryError) {
		console.error(`Delivery failed (${error.reason}): ${error.message}`);
		if (error.reason === 'not-installed') {
			console.error(
				'The recipient has no personal installation of the Teams app. Publish the app '
					+ 'package to the organisation catalog and assign a Teams app setup policy, or '
					+ 'have the recipient upload it once.',
			);
		}
	} else {
		console.error(error instanceof Error ? error.message : String(error));
	}
	process.exit(1);
}
