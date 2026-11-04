import { defineConfig } from "@playwright/test";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET, TEST_CRON_SECRET, TEST_PORT } from "./tests/e2e/constants";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: `http://localhost:${TEST_PORT}` },
  webServer: {
    command: `npm run build && npm run start -- -p ${TEST_PORT}`,
    url: `http://localhost:${TEST_PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      AUTH_SECRET: TEST_AUTH_SECRET,
      AUTH_TRUST_HOST: "true",
      AUTH_ALLOWED_EMAIL: TEST_ALLOWED_EMAIL,
      AUTH_GITHUB_ID: "e2e",
      AUTH_GITHUB_SECRET: "e2e",
      CRON_SECRET: TEST_CRON_SECRET,
    },
  },
});
