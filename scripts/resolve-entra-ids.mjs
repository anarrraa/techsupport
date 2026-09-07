/**
 * Fills in every missing Microsoft Entra object id in the escalation directory,
 * looking each person up by the email recorded beside them.
 *
 *   npm run resolve:ids
 *   npm run resolve:ids -- config/escalation.json
 *
 * Teams cannot address a person by email, so the directory needs object ids —
 * but pasting GUIDs by hand is how a recipient ends up silently unreachable.
 * This writes them in and then loads the file back to prove the result is valid.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadEscalationConfig } from '../src/lib/escalation-config.ts';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL = '00000000-0000-0000-0000-000000000000';
const path = process.argv[2]?.trim() || 'config/escalation.json';

try {
	execFileSync('az', ['version'], { stdio: 'ignore' });
} catch {
	console.error(
		'Azure CLI not found. Install and sign in first:\n'
			+ '  brew install azure-cli\n'
			+ '  az login --tenant zerotech.mn\n\n'
			+ 'No install possible? Read each id from https://developer.microsoft.com/graph/graph-explorer\n'
			+ '  GET https://graph.microsoft.com/v1.0/users/<email>?$select=id,displayName',
	);
	process.exit(2);
}

const directory = JSON.parse(readFileSync(path, 'utf8'));
const people = Object.entries(directory.people ?? {});
const pending = people.filter(
	([, person]) =>
		person.email && (!GUID.test(person.entraObjectId ?? '') || person.entraObjectId === NIL),
);

if (pending.length === 0) {
	const missing = people.filter(([, person]) => !person.email && !GUID.test(person.entraObjectId ?? ''));
	console.log(
		missing.length === 0
			? 'Every object id is already filled in.'
			: `Nothing to resolve. Add an "email" to: ${missing.map(([handle]) => handle).join(', ')}`,
	);
	process.exit(0);
}

let failed = 0;
for (const [handle, person] of pending) {
	try {
		const id = execFileSync('az', ['ad', 'user', 'show', '--id', person.email, '--query', 'id', '-o', 'tsv'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
		if (!GUID.test(id)) throw new Error(`Entra returned ${JSON.stringify(id)}`);
		person.entraObjectId = id;
		console.log(`${handle}: resolved`);
	} catch (error) {
		failed += 1;
		console.error(`${handle} (${person.email}): ${error.stderr?.toString().trim() || error.message}`);
	}
}

writeFileSync(path, `${JSON.stringify(directory, null, '\t')}\n`, 'utf8');
console.log(`Wrote ${path}`);

// The point of the script is a directory the workflow can actually load.
try {
	const loaded = await loadEscalationConfig(path);
	console.log(`Valid: ${Object.keys(loaded.people).length} people, projects ${Object.keys(loaded.projects).join(', ')}`);
} catch (error) {
	console.error(`Still not usable: ${error.message}`);
	process.exit(1);
}
process.exit(failed > 0 ? 1 : 0);
