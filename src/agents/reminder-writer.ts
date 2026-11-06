import { defineAgent } from '@flue/runtime';
import { REMINDER_INTRO_INSTRUCTIONS, REMINDER_INTRO_MODEL } from '../reminder/reminder-intro.ts';

/**
 * Flue binding for the Reminder Intro. The prompt contract itself lives in
 * src/reminder/reminder-intro.ts so that module stays framework-free; this file
 * only adapts it to the runtime and keeps the agent discoverable.
 */
export default defineAgent(() => ({
	model: REMINDER_INTRO_MODEL,
	instructions: REMINDER_INTRO_INSTRUCTIONS,
}));
