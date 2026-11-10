import { defineConfig } from "@playwright/test";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET, TEST_CRON_SECRET, TEST_DB_PORT, TEST_PORT, testPasswordHash } from "./tests/e2e/constants";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { baseURL: `http://localhost:${TEST_PORT}` },
  webServer: [
    {
      command: "node tests/e2e/test-db.mjs",
      port: TEST_DB_PORT,
      reuseExistingServer: false,
    },
    {
      command: `npm run build && npm run start -- -p ${TEST_PORT}`,
      url: `http://localhost:${TEST_PORT}/login`,
      timeout: 240_000,
      reuseExistingServer: false,
      // These override .env.local, which keeps tests away from the real database and paid APIs.
      env: {
        DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres?sslmode=disable`,
        DIRECT_URL: "",
        ANTHROPIC_API_KEY: "",
        RAPIDAPI_KEY: "",
        RESEND_API_KEY: "",
        AUTH_SECRET: TEST_AUTH_SECRET,
        AUTH_TRUST_HOST: "true",
        AUTH_ALLOWED_EMAIL: TEST_ALLOWED_EMAIL,
        AUTH_PASSWORD_HASH: testPasswordHash(),
        CRON_SECRET: TEST_CRON_SECRET,
      },
    },
  ],
});
