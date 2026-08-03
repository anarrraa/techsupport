import { defineAgent } from '@flue/runtime';

export default defineAgent(() => ({
	model: 'google-vertex/gemini-2.5-flash',
	instructions: [
		'Write one short, polite opening sentence for a Microsoft Teams SLA reminder.',
		'Input contains aggregate counts only: ticketCount, developerCount, and priorities.',
		'Do not invent ticket details, names, links, or numbers.',
		'Default to Mongolian. Output one plain-text line under 160 characters with no sign-off.',
	].join('\n'),
}));
