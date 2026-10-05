import { defineAgent } from '@flue/runtime';
import { DIGEST_INSTRUCTIONS, DIGEST_MODEL } from '../lib/ticket-digest.ts';

/**
 * Flue binding for the Ticket Digest. The prompt contract itself lives in
 * src/lib/ticket-digest.ts so that module stays framework-free; this file only
 * adapts it to the runtime and keeps the agent discoverable.
 */
export default defineAgent(() => ({
	model: DIGEST_MODEL,
	instructions: DIGEST_INSTRUCTIONS,
}));
