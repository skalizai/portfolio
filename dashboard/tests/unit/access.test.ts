import { describe, expect, it } from "vitest";
import { decideAccess, isAllowedEmail, isValidCronRequest } from "@/lib/access";

const OWNER = "owner@example.com";
const CRON = "cron-secret";

function decide(pathname: string, email?: string | null, authorization?: string) {
  return decideAccess({ pathname, email, authorization, allowedEmail: OWNER, cronSecret: CRON });
}

describe("isAllowedEmail", () => {
  it("accepts the configured email, ignoring case and spaces", () => {
    expect(isAllowedEmail(" Owner@Example.com ", OWNER)).toBe(true);
  });

  it("rejects any other email, including lookalikes", () => {
    expect(isAllowedEmail("other@example.com", OWNER)).toBe(false);
    expect(isAllowedEmail("owner@example.com.evil.test", OWNER)).toBe(false);
  });

  it("rejects everyone when no allowed email is configured", () => {
    expect(isAllowedEmail(OWNER, undefined)).toBe(false);
    expect(isAllowedEmail(OWNER, "")).toBe(false);
    expect(isAllowedEmail("", "")).toBe(false);
    expect(isAllowedEmail(null, OWNER)).toBe(false);
  });
});

describe("isValidCronRequest", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isValidCronRequest(`Bearer ${CRON}`, CRON)).toBe(true);
    expect(isValidCronRequest(`Bearer ${CRON}x`, CRON)).toBe(false);
    expect(isValidCronRequest(CRON, CRON)).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    expect(isValidCronRequest("Bearer ", "")).toBe(false);
    expect(isValidCronRequest("Bearer undefined", undefined)).toBe(false);
  });
});

describe("decideAccess", () => {
  it("sends signed-out page requests to login", () => {
    for (const path of ["/", "/applications", "/profile", "/settings", "/logs"]) {
      expect(decide(path)).toBe("redirect-login");
    }
  });

  it("refuses signed-out API requests with 401", () => {
    for (const path of ["/api/stats", "/api/jobs", "/api/profile/cv", "/api"]) {
      expect(decide(path)).toBe("unauthorized");
    }
  });

  it("treats a session for another email as signed out", () => {
    expect(decide("/", "other@example.com")).toBe("redirect-login");
    expect(decide("/api/stats", "other@example.com")).toBe("unauthorized");
    expect(decide("/login", "other@example.com")).toBe("allow");
  });

  it("allows the owner everywhere and moves them off the login page", () => {
    expect(decide("/", OWNER)).toBe("allow");
    expect(decide("/api/stats", OWNER)).toBe("allow");
    // The page itself checks whether the session is still current before sending you home.
    expect(decide("/login", OWNER)).toBe("allow");
  });

  it("leaves only the auth routes open, not lookalike paths", () => {
    expect(decide("/api/auth/signin")).toBe("allow");
    expect(decide("/api/authx")).toBe("unauthorized");
    expect(decide("/api/auth-secrets/x")).toBe("unauthorized");
  });

  it("opens only the password reset and session-ended paths without a session", () => {
    for (const path of ["/login/reset", "/api/security/reset/start", "/api/security/reset/confirm", "/session-ended"]) expect(decide(path)).toBe("allow");
    expect(decide("/security")).toBe("redirect-login");
    expect(decide("/api/security/password/start")).toBe("unauthorized");
    expect(decide("/api/security/reset/startx")).toBe("unauthorized");
    expect(decide("/login/reset/x")).toBe("redirect-login");
  });

  it("lets the cron secret open the fetch route and nothing else", () => {
    const bearer = `Bearer ${CRON}`;
    expect(decide("/api/jobs/fetch", null, bearer)).toBe("allow");
    expect(decide("/api/jobs/score", null, bearer)).toBe("allow");
    expect(decide("/api/applications/auto", null, bearer)).toBe("unauthorized");
    expect(decide("/api/notify/digest", null, bearer)).toBe("allow");
    expect(decide("/api/cron/search", null, bearer)).toBe("allow");
    expect(decide("/api/cron/digest", null, bearer)).toBe("allow");
    expect(decide("/api/cron/digest")).toBe("unauthorized");
    expect(decide("/api/applications/x", null, bearer)).toBe("unauthorized");
    expect(decide("/api/applications/process", null, bearer)).toBe("unauthorized");
    expect(decide("/api/jobs/score", null, "Bearer wrong")).toBe("unauthorized");
    expect(decide("/api/jobs/fetch", null, "Bearer wrong")).toBe("unauthorized");
    expect(decide("/api/jobs/fetch")).toBe("unauthorized");
    expect(decide("/api/stats", null, bearer)).toBe("unauthorized");
    expect(decide("/", null, bearer)).toBe("redirect-login");
  });
});
