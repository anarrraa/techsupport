import { defineConfig } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	// Generate needs no database; only db push and the server do.
	datasource: { url: process.env.DATABASE_URL ?? '' },
});
