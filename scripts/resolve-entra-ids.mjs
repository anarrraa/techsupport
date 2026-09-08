/**
 * Fills in every missing Microsoft Entra object id in the escalation directory,
 * looking each person up in Microsoft Graph by the email recorded beside them.
 *
 *   npm run resolve:ids
 *
 * Uses the same app-only Graph credential the bot uses to install itself for a
 * recipient, so there is no Azure CLI to install and no interactive sign-in.
 * Needs `User.Read.All` as an application permission with admin consent.
 *
 * Teams cannot address a person by email, so the directory needs object ids —
 * but a GUID pasted by hand and wrong by one character is a recipient who is
 * silently unreachable. This writes them in and loads the file back to prove
 * the result is usable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTeamsBotConfig } from '../src/lib/config.ts';
import { fetchOk } from '../src/lib/http.ts';
import { loadEscalationConfig } from '../src/lib/escalation-config.ts';
import { acquireToken } from '../src/lib/teams-bot.ts';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL = '00000000-0000-0000-0000-000000000000';

const bot = loadTeamsBotConfig();
if (!bot) {
	console.error('Set TEAMS_BOT_APP_ID and TEAMS_BOT_TENANT_ID first (see .env.example).');
	process.exit(2);
}

const path =
	process.argv[2]?.trim() || process.env.ESCALATION_CONFIG_FILE?.trim() || 'config/escalation.json';
const directory = JSON.parse(readFileSync(path, 'utf8'));
const people = Object.entries(directory.people ?? {});
const needsId = ([, person]) =>
	!GUID.test(person.entraObjectId ?? '') || person.entraObjectId === NIL;
const pending = people.filter((entry) => entry[1].email && needsId(entry));

if (pending.length === 0) {
	const stuck = people.filter((entry) => !entry[1].email && needsId(entry));
	console.log(
		stuck.length === 0
			? 'Every object id is already filled in.'
			: `Nothing to resolve. Add an "email" to: ${stuck.map(([handle]) => handle).join(', ')}`,
	);
	process.exit(0);
}

const token = await acquireToken(
	'https://graph.microsoft.com/.default',
	bot,
	bot.graphClientId,
	bot.graphClientSecret,
);

let failed = 0;
for (const [handle, person] of pending) {
	try {
		const response = await fetchOk(
			`${GRAPH}/users/${encodeURIComponent(person.email)}?$select=id,displayName`,
			{ headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
			bot.http,
		);
		const user = await response.json();
		if (!GUID.test(user.id ?? '')) throw new Error(`Graph returned ${JSON.stringify(user.id)}`);
		person.entraObjectId = user.id;
		console.log(`${handle}: resolved (${user.displayName})`);
	} catch (error) {
		failed += 1;
		const hint = error?.status === 403
			? ' — grant User.Read.All as an application permission with admin consent'
			: error?.status === 404
				? ' — no such user in this tenant'
				: '';
		console.error(`${handle} (${person.email}): ${error.message}${hint}`);
	}
}

writeFileSync(path, `${JSON.stringify(directory, null, '\t')}\n`, 'utf8');
console.log(`Wrote ${path}`);

// The point of the script is a directory the workflow can actually load.
try {
	const loaded = await loadEscalationConfig(path);
	console.log(
		`Valid: ${Object.keys(loaded.people).length} people, projects ${Object.keys(loaded.projects).join(', ')}`,
	);
} catch (error) {
	console.error(`Still not usable: ${error.message}`);
	process.exit(1);
}
process.exit(failed > 0 ? 1 : 0);
