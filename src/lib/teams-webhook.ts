import type { HttpConfig } from './config.ts';
import { fetchOk, type Fetch, type Sleep } from './http.ts';

export async function postToChannel(
	text: string,
	webhookUrl: string,
	http: HttpConfig,
	fetchImpl: Fetch = fetch,
	sleep?: Sleep,
): Promise<void> {
	await fetchOk(
		webhookUrl,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text }),
		},
		http,
		fetchImpl,
		sleep,
	);
}
