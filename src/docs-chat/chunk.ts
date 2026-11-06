import { createHash } from 'node:crypto';

/**
 * Markdown → retrieval chunks for the docs chat (for-agents/prd-docs-chat.md).
 * Pure: the indexer reads files, this only splits text.
 */

export const CHUNK_CHARS = 1500;
export const CHUNK_OVERLAP = 150;

export interface DocChunk {
	client: string;
	system: string;
	path: string;
	/** Heading path, e.g. `Guide › Setup`; empty before the first heading. */
	heading: string;
	content: string;
	/** sha256 of path, heading and content, so identical text in two files stays two rows. */
	contentHash: string;
}

const PATH = /^documents\/([^/]+)\/([^/]+)\/[^/]+\.md$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;

export function chunkDocument({ path, text }: { path: string; text: string }): DocChunk[] {
	const match = PATH.exec(path);
	if (!match) throw new Error(`Document path must be documents/<client>/<system>/<file>.md: ${path}`);
	const [, client, system] = match;

	const sections: { heading: string; lines: string[] }[] = [{ heading: '', lines: [] }];
	const stack: string[] = [];
	let fence = ''; // the open fence marker, '' outside code
	for (const line of text.split(/\r?\n/)) {
		const marker = FENCE.exec(line);
		// "```npm i``` then run" opens and closes on one line: not a fence. Only a bare run of the same char, at least as long, closes one.
		if (marker && !fence && !marker[2].includes(marker[1])) fence = marker[1];
		else if (marker && fence && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = '';
		const heading = fence || marker ? null : HEADING.exec(line);
		if (heading) {
			stack.length = heading[1].length - 1;
			stack[heading[1].length - 1] = heading[2].replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();
			sections.push({ heading: stack.filter(Boolean).join(' › '), lines: [] });
		}
		sections.at(-1)!.lines.push(line);
	}

	const chunks: DocChunk[] = [];
	const seen = new Set<string>();
	for (const { heading, lines } of sections) {
		// A heading with no body says nothing a retrieval hit could use.
		if (!lines.some((line, i) => line.trim() && !(i === 0 && heading && HEADING.test(line)))) continue;
		for (const content of split(lines.join('\n').trim())) {
			const contentHash = createHash('sha256').update(`${path}\0${heading}\0${content}`).digest('hex');
			if (seen.has(contentHash)) continue;
			seen.add(contentHash);
			chunks.push({ client, system, path, heading, content, contentHash });
		}
	}
	return chunks;
}

/** Cap at CHUNK_CHARS, preferring a line or word break, each piece repeating the previous one's last CHUNK_OVERLAP chars. */
function split(text: string): string[] {
	const pieces: string[] = [];
	let start = 0;
	while (start < text.length) {
		let end = Math.min(start + CHUNK_CHARS, text.length);
		if (end < text.length) {
			const window = text.slice(start + CHUNK_CHARS / 2, end);
			const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
			if (cut > 0) end = start + CHUNK_CHARS / 2 + cut;
		}
		const piece = text.slice(start, end).trim();
		if (piece) pieces.push(piece);
		if (end >= text.length) break;
		start = end - CHUNK_OVERLAP;
	}
	return pieces;
}
