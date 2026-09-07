/**
 * Builds the Teams app package an administrator uploads to the organisation
 * catalog.
 *
 *   TEAMS_BOT_APP_ID=<guid> npm run package:teams
 *
 * Teams requires manifest.json and both icons at the root of the archive, not
 * inside a folder, which is the usual reason an upload is rejected. The app id
 * is substituted rather than committed so the manifest stays environment
 * independent and an unset id fails loudly instead of shipping a broken package.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE = new URL('../packages/teams-app/', import.meta.url);
const OUTPUT = new URL('../packages/sla-reminder-teams-app.zip', import.meta.url);
const ICONS = ['color.png', 'outline.png'];
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const appId = process.env.TEAMS_BOT_APP_ID?.trim();
if (!appId) {
	console.error('Set TEAMS_BOT_APP_ID to the bot\'s Microsoft Entra application id first.');
	process.exit(2);
}
if (!GUID.test(appId)) {
	console.error(`TEAMS_BOT_APP_ID must be a GUID; got ${appId.length} characters that are not one.`);
	process.exit(2);
}

const manifest = readFileSync(new URL('manifest.json', SOURCE), 'utf8');
const remaining = manifest.replaceAll('${TEAMS_BOT_APP_ID}', appId);
if (remaining.includes('${')) {
	console.error('manifest.json still contains an unsubstituted placeholder.');
	process.exit(1);
}
JSON.parse(remaining);

const staging = mkdtempSync(join(tmpdir(), 'teams-app-'));
try {
	mkdirSync(staging, { recursive: true });
	writeFileSync(join(staging, 'manifest.json'), remaining, 'utf8');
	for (const icon of ICONS) copyFileSync(new URL(icon, SOURCE), join(staging, icon));

	const zipPath = OUTPUT.pathname;
	rmSync(zipPath, { force: true });
	execFileSync('zip', ['-q', '-j', zipPath, join(staging, 'manifest.json'), ...ICONS.map((icon) => join(staging, icon))]);
	console.log(`Built ${zipPath}`);
	console.log(execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' }).trim());
} finally {
	rmSync(staging, { recursive: true, force: true });
}
