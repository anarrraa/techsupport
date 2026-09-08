/**
 * Proves the delivery path end to end before the scheduled workflow depends on
 * it: token, catalog lookup, install for the recipient, chat lookup, activity.
 *
 *   node scripts/verify-teams-bot.ts <entra-object-id>
 *
 * Prints outcomes only: no token, secret, or recipient identifier reaches the
 * output.
 */
import { loadTeamsBotConfig } from '../src/lib/config.ts';
import { createBotSender, TeamsDeliveryError } from '../src/lib/teams-bot.ts';

const recipient = process.argv[2]?.trim();
if (!recipient) {
	console.error('Usage: node scripts/verify-teams-bot.ts <entra-object-id>');
	process.exit(2);
}

let config: ReturnType<typeof loadTeamsBotConfig>;
try {
	config = loadTeamsBotConfig();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(2);
}
if (!config) {
	console.error('Set TEAMS_BOT_APP_ID and TEAMS_BOT_TENANT_ID first (see .env.example).');
	process.exit(2);
}

const REMEDY: Record<string, string> = {
	'not-in-catalog':
		'Publish the app package to the organisation catalog, then check that TEAMS_APP_EXTERNAL_ID '
			+ 'matches the manifest id of the published package.',
	'install-forbidden':
		'Grant the app registration TeamsAppInstallation.ReadWriteForUser.All and AppCatalog.Read.All '
			+ 'as application permissions, with admin consent.',
	'not-installed':
		'Graph reported no personal installation even after installing. Confirm the recipient is a '
			+ 'licensed Teams user in this tenant.',
	'writes-blocked': 'A tenant or app policy forbids bot messages to this recipient.',
};

try {
	const sender = await createBotSender(config);
	console.log('Bot Framework and Graph tokens acquired');
	await sender.send({
		entraObjectId: recipient,
		text: 'Delivery check from the SLA reminder workflow. No action needed.',
	});
	console.log('Direct message delivered');
} catch (error) {
	if (error instanceof TeamsDeliveryError) {
		console.error(`Delivery failed (${error.reason}): ${error.message}`);
		const remedy = REMEDY[error.reason];
		if (remedy) console.error(remedy);
	} else {
		console.error(error instanceof Error ? error.message : String(error));
	}
	process.exit(1);
}
