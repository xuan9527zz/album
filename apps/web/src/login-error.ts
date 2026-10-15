export function loginErrorText(error: unknown): string {
  const failure =
    error && typeof error === "object"
      ? (error as { code?: string; status?: number; name?: string })
      : {};
  if (failure.code === "invalid_credentials")
    return "邮箱或相册密码不正确，请重新输入。";
  if (failure.code === "email_not_confirmed")
    return "邮箱尚未确认，请先打开相册邀请链接完成设置。";
  if (failure.code === "user_banned") return "账号暂不可用，请联系相册管理员。";
  if (failure.code === "over_request_rate_limit" || failure.status === 429)
    return "登录尝试过于频繁，请稍后再试。";
  if ((failure.status ?? 0) >= 500) return "登录服务暂时不可用，请稍后重试。";
  if (
    failure.code === "request_timeout" ||
    failure.name === "AbortError" ||
    failure.name === "TimeoutError"
  )
    return "登录请求超时，请检查网络后重试。";
  if (
    failure.name === "AuthRetryableFetchError" ||
    failure.name === "TypeError"
  )
    return "暂时连接不到登录服务，请切换 Wi-Fi 或移动网络后重试。";
  return "暂时无法登录，请稍后重试或联系相册管理员。";
}
