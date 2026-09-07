import { readFile } from 'node:fs/promises';
import * as v from 'valibot';
import type { ContactLevel } from './escalation.ts';

/**
 * The escalation directory, resolved from a repository file at run time rather
 * than hardcoded in this module (`docs/brd-teams-bot-escalation.md` decisions 2
 * and 5). Teams rejects an email or user principal name for a proactive direct
 * message, so every recipient needs a Microsoft Entra object id.
 *
 * A level with no contact configured is an error, never a skipped or
 * redirected notification (`AGENTS.md`).
 */

const LEVEL_KEYS = ['L2', 'L3', 'L4', 'L5'] as const;

const PersonSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1)),
	entraObjectId: v.pipe(v.string(), v.uuid('must be a Microsoft Entra object id (a UUID)')),
	jiraAccountId: v.optional(v.pipe(v.string(), v.minLength(1))),
});

const EscalationConfigSchema = v.object({
	people: v.record(v.pipe(v.string(), v.minLength(1)), PersonSchema),
	projects: v.record(
		v.pipe(v.string(), v.minLength(1)),
		v.object({
			L2: v.optional(v.string()),
			L3: v.optional(v.string()),
			L4: v.optional(v.string()),
			L5: v.optional(v.string()),
		}),
	),
	/** Off-hours Critical/High surfaces this contact; a human places the call. */
	onCall: v.optional(v.string()),
});

export type Person = v.InferOutput<typeof PersonSchema>;
export type EscalationConfig = v.InferOutput<typeof EscalationConfigSchema>;

export async function loadEscalationConfig(path: string): Promise<EscalationConfig> {
	let raw: string;
	try {
		raw = await readFile(path, 'utf8');
	} catch (error) {
		throw new Error(`Escalation config file not readable at ${path}`, { cause: error });
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(`Escalation config file at ${path} is not valid JSON`, { cause: error });
	}

	const result = v.safeParse(EscalationConfigSchema, parsed);
	if (!result.success) {
		const issues = result.issues
			.map((issue) => `${v.getDotPath(issue) ?? '(root)'}: ${issue.message}`)
			.join('; ');
		throw new Error(`Escalation config file at ${path} is invalid — ${issues}`);
	}

	const config = result.output;
	for (const [projectKey, levels] of Object.entries(config.projects)) {
		for (const levelKey of LEVEL_KEYS) {
			const handle = levels[levelKey];
			if (handle !== undefined && !(handle in config.people)) {
				throw new Error(
					`Escalation config: project ${projectKey} ${levelKey} names unknown person "${handle}"`,
				);
			}
		}
	}
	if (config.onCall !== undefined && !(config.onCall in config.people)) {
		throw new Error(`Escalation config: onCall names unknown person "${config.onCall}"`);
	}
	return config;
}

/** `DC-844` -> `DC`. */
export function projectKeyOf(ticketKey: string): string {
	const separator = ticketKey.lastIndexOf('-');
	return separator === -1 ? ticketKey : ticketKey.slice(0, separator);
}

export function personForJiraAccount(
	config: EscalationConfig,
	jiraAccountId: string | null,
): Person | null {
	if (!jiraAccountId) return null;
	for (const person of Object.values(config.people)) {
		if (person.jiraAccountId === jiraAccountId) return person;
	}
	return null;
}

export function contactFor(
	config: EscalationConfig,
	projectKey: string,
	level: ContactLevel,
): Person {
	const handle = config.projects[projectKey]?.[`L${level}`];
	if (!handle) {
		throw new Error(
			`No L${level} escalation contact configured for project ${projectKey} — `
				+ 'add it to the escalation config file',
		);
	}
	// Referential integrity is checked at load time, so this cannot be missing.
	return config.people[handle] as Person;
}

export function onCallContact(config: EscalationConfig): Person | null {
	return config.onCall ? config.people[config.onCall] ?? null : null;
}
