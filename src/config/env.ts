import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Google Calendar OAuth2
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_REFRESH_TOKEN: z.string().min(1, "GOOGLE_REFRESH_TOKEN is required"),
  GOOGLE_CALENDAR_ID: z.string().min(1, "GOOGLE_CALENDAR_ID is required"),

  // Resend
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  EMAIL_FROM: z.string().min(1, "EMAIL_FROM is required (e.g. 'Name <email@domain>')"),

  // Host
  HOST_EMAIL: z.string().email("HOST_EMAIL must be a valid email"),

  // Security
  SUN_API_SECRET: z.string().min(1, "SUN_API_SECRET is required"),
  APPROVAL_TOKEN_SECRET: z.string().min(1, "APPROVAL_TOKEN_SECRET is required"),

  // URLs
  BASE_URL: z.string().url("BASE_URL must be a valid URL"),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ✗ ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error(`\n❌ Invalid environment variables:\n${formatted}\n`);
    process.exit(1);
  }

  return Object.freeze(result.data);
}

export const env = loadEnv();

export type Env = z.infer<typeof envSchema>;
