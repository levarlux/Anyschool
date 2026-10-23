require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

module.exports = {
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};