import { expect, it } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { loginErrorText } from "../apps/web/src/login-error";

it("distinguishes SDK transport failures and server outages from invalid credentials", () => {
  expect(
    loginErrorText(new AuthRetryableFetchError("Failed to fetch", 0)),
  ).toContain("连接不到登录服务");
  expect(
    loginErrorText(new AuthRetryableFetchError("HTTP 503", 503)),
  ).toContain("服务暂时不可用");
  expect(
    loginErrorText(
      new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    ),
  ).toContain("邮箱或相册密码不正确");
});

it("recognizes account state, throttling and timeouts instead of blaming passwords", () => {
  expect(
    loginErrorText(new AuthApiError("rate limited", 429, undefined)),
  ).toContain("过于频繁");
  expect(
    loginErrorText(new AuthApiError("unconfirmed", 400, "email_not_confirmed")),
  ).toContain("邮箱尚未确认");
  expect(
    loginErrorText(new AuthApiError("banned", 400, "user_banned")),
  ).toContain("账号暂不可用");
  expect(
    loginErrorText(new AuthApiError("timeout", 400, "request_timeout")),
  ).toContain("请求超时");
});

it("does not expose unrecognized provider messages", () => {
  const result = loginErrorText(
    new AuthApiError("sensitive server details", 400, "unexpected_failure"),
  );
  expect(result).not.toContain("sensitive");
  expect(result).not.toContain("密码不正确");
  expect(loginErrorText(null)).toBe(result);
});
