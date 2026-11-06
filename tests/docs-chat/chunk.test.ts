import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkDocument, CHUNK_CHARS } from '../../src/docs-chat/chunk.ts';

const path = 'documents/acme/billing/guide.md';

test('chunks carry client, system, path and the nearest heading path', () => {
	const chunks = chunkDocument({ path, text: [
		'Intro line before any heading.',
		'# Guide',
		'Overview text.',
		'## Setup',
		'Install it.',
		'### Keys',
		'Rotate keys monthly.',
		'## Usage',
		'Run it.',
	].join('\n') });
	assert.deepEqual(chunks.map((c) => c.heading), ['', 'Guide', 'Guide › Setup', 'Guide › Setup › Keys', 'Guide › Usage']);
	assert.ok(chunks.every((c) => c.client === 'acme' && c.system === 'billing' && c.path === path));
	assert.match(chunks[3].content, /^### Keys\nRotate keys monthly\.$/);
});

test('heading-only and whitespace sections are dropped', () => {
	const chunks = chunkDocument({ path, text: '# Title\n\n## Empty\n   \n## Body\ntext' });
	assert.deepEqual(chunks.map((c) => c.heading), ['Title › Body']);
});

test('hashes inside fences and colour codes are not headings', () => {
	const chunks = chunkDocument({ path, text: '# Real\n```sh\n# comment\n```\n#EAE6FF**A3:** note' });
	assert.equal(chunks.length, 1);
	assert.equal(chunks[0].heading, 'Real');
});

test('inline triple backticks do not open a fence', () => {
	const chunks = chunkDocument({ path, text: '# One\n```npm i``` then run\n# Two\nbody' });
	assert.deepEqual(chunks.map((c) => c.heading), ['One', 'Two']);
});

test('tilde fences hide headings and close only on a matching marker', () => {
	const chunks = chunkDocument({ path, text: '# Real\n~~~\n# comment\n```\n# still code\n~~~\n# After\nbody' });
	assert.deepEqual(chunks.map((c) => c.heading), ['Real', 'After']);
});

test('heading text loses markdown emphasis', () => {
	assert.equal(chunkDocument({ path, text: '##  **Bold** heading\nbody' })[0].heading, 'Bold heading');
});

test('long sections split under the cap with overlap', () => {
	const words = Array.from({ length: 800 }, (_, i) => `word${i}`).join(' ');
	const chunks = chunkDocument({ path, text: `# Long\n${words}` });
	assert.ok(chunks.length > 1);
	assert.ok(chunks.every((c) => c.content.length <= CHUNK_CHARS && c.heading === 'Long'));
	const tail = chunks[0].content.slice(-50).split(' ').at(-1)!;
	assert.ok(chunks[1].content.includes(tail), 'next chunk repeats the end of the previous one');
	assert.ok(chunks.at(-1)!.content.endsWith('word799'));
});

test('content hash is stable and depends on location', () => {
	const a = chunkDocument({ path, text: '# A\nsame' })[0];
	assert.equal(a.contentHash, chunkDocument({ path, text: '# A\nsame' })[0].contentHash);
	assert.notEqual(a.contentHash, chunkDocument({ path: 'documents/acme/other/guide.md', text: '# A\nsame' })[0].contentHash);
	assert.match(a.contentHash, /^[0-9a-f]{64}$/);
});

test('identical chunks in one file are kept once', () => {
	const chunks = chunkDocument({ path, text: '# A\nsame\n# A\nsame' });
	assert.equal(chunks.length, 1);
});

test('paths not shaped documents/<client>/<system>/<file>.md fail visibly', () => {
	for (const bad of ['documents/acme/guide.md', 'documents/acme/billing/sub/guide.md', 'other/acme/billing/guide.md', 'documents/acme/billing/guide.txt']) {
		assert.throws(() => chunkDocument({ path: bad, text: 'x' }), /documents\/<client>\/<system>\/<file>\.md/);
	}
});
