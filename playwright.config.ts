import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const STAGING_URL = process.env.STAGING_URL || "https://staging-sun.marmiksoni.co";
const LOCAL_URL = process.env.LOCAL_URL || "http://localhost:30000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "e2e-staging",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: STAGING_URL,
      },
    },
    {
      name: "e2e-local",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: LOCAL_URL,
      },
    },
  ],
});
