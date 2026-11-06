import { FinishReason, GoogleGenAI } from '@google/genai';

/**
 * Vertex AI adapter for the docs chat (for-agents/prd-docs-chat.md): the only
 * file that imports @google/genai. Only documents/ text and the user's question
 * come through here, never Jira data (AGENTS.md).
 */

export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIMENSIONS = 768; // must match vector(768) in prisma/schema.prisma
// Vertex caps a predict call by instance count and total tokens (~20k); 16 × 1500 chars of Cyrillic stays under it.
export const EMBED_BATCH = 16;
export const ANSWER_MODEL = 'gemini-2.5-flash';
// One timeout covers all attempts of a call; embed + answer must stay under the frontend's 60 s.
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3; // including the first; the SDK retries 408/429/5xx with backoff

let client: GoogleGenAI | undefined;

function vertex() {
	if (!client) {
		const project = process.env.GOOGLE_CLOUD_PROJECT;
		if (!project) throw new Error('GOOGLE_CLOUD_PROJECT is required for the docs chat');
		client = new GoogleGenAI({
			vertexai: true,
			project,
			location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
			httpOptions: { timeout: TIMEOUT_MS, retryOptions: { attempts: ATTEMPTS } },
		});
	}
	return client;
}

/** One vector per text, in order. Sequential batches: concurrency 1. */
export async function embed(texts: string[], kind: 'document' | 'query'): Promise<number[][]> {
	const vectors: number[][] = [];
	for (let i = 0; i < texts.length; i += EMBED_BATCH) {
		const batch = texts.slice(i, i + EMBED_BATCH);
		const { embeddings } = await vertex().models.embedContent({
			model: EMBED_MODEL,
			contents: batch,
			config: { taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT', outputDimensionality: EMBED_DIMENSIONS },
		});
		if (embeddings?.length !== batch.length || embeddings.some((e) => e.values?.length !== EMBED_DIMENSIONS)) {
			throw new Error(`Vertex returned ${embeddings?.length ?? 0} embeddings of the wrong shape for ${batch.length} texts`);
		}
		vectors.push(...embeddings.map((e) => e.values!));
	}
	return vectors;
}

export async function answer(system: string, user: string): Promise<string> {
	const response = await vertex().models.generateContent({
		model: ANSWER_MODEL,
		contents: user,
		// No thinking: grounded lookup, and it keeps latency and output tokens bounded.
		config: { systemInstruction: system, temperature: 0, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
	});
	const reason = response.candidates?.[0]?.finishReason;
	if (reason === FinishReason.MAX_TOKENS) return `${response.text ?? ''} …(answer truncated)`;
	// Safety and other stops leave a partial or empty answer: '' falls back to "don't know".
	if (reason !== FinishReason.STOP) return '';
	return response.text ?? '';
}
