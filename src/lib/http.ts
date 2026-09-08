import type { HttpConfig } from './config.ts';

export type Fetch = typeof fetch;
export type Sleep = (milliseconds: number) => Promise<void>;
export const MAX_RETRY_DELAY_MS = 60_000;
const MAX_ERROR_BODY_CHARS = 500;

/**
 * A non-retryable HTTP failure, carrying the status and a bounded slice of the
 * body. Callers that must branch on a provider's error code — Teams answers
 * several distinct conditions with 403 — need the body; nothing logs it, so
 * provider text never reaches the run journal.
 */
export class ExternalRequestError extends Error {
	// Declared, not constructor parameter properties: Node's type stripping runs
	// the tests directly from TypeScript and rejects that syntax.
	readonly status: number;
	readonly body: string;

	constructor(status: number, statusText: string, body: string) {
		super(`External request failed: ${status} ${statusText}`);
		this.name = 'ExternalRequestError';
		this.status = status;
		this.body = body;
	}
}

export async function fetchOk(
	url: string,
	init: RequestInit,
	config: HttpConfig,
	fetchImpl: Fetch = fetch,
	sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<Response> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
		try {
			const response = await fetchImpl(url, { ...init, signal: controller.signal });
			if (response.ok) return response;

			if (!isRetryableStatus(response.status) || attempt === config.maxRetries) {
				throw new ExternalRequestError(
					response.status,
					response.statusText,
					await readBoundedBody(response),
				);
			}
			await sleep(retryDelayMs(response, attempt));
		} catch (error) {
			lastError = error;
			if (error instanceof ExternalRequestError) throw error;
			if (attempt === config.maxRetries) {
				if (controller.signal.aborted) {
					throw new Error(`External request timed out after ${config.timeoutMs}ms`, { cause: error });
				}
				throw new Error('External request failed after retries', { cause: error });
			}
			await sleep(250 * 2 ** attempt);
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new Error('External request failed after retries', { cause: lastError });
}

async function readBoundedBody(response: Response): Promise<string> {
	try {
		return (await response.text()).slice(0, MAX_ERROR_BODY_CHARS);
	} catch {
		return '';
	}
}

function isRetryableStatus(status: number): boolean {
	return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(response: Response, attempt: number): number {
	const retryAfter = response.headers.get('retry-after');
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds) && seconds >= 0) {
			return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
		}

		const date = Date.parse(retryAfter);
		if (!Number.isNaN(date)) return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_DELAY_MS);
	}
	return 250 * 2 ** attempt;
}
