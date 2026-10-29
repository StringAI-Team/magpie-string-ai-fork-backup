# 变更记录

本分支从上游 [Jiao77/magpie-string-ai](https://github.com/Jiao77/magpie-string-ai) 派生，只发布审查过的固定版本。

## 1.1.1

相对上游 `1.1.0`（commit `0457efb`）的唯一改动是安全加固。

**带凭据的请求不再跟随重定向。**

原先三处 `fetch` 使用默认的 `redirect: "follow"`。上游或中间设备返回 307/302 时，`fetch` 会把请求转发到响应头指定的地址，而 `x-api-key` 不在 `fetch` 规范剥离的敏感头之列，会连同完整 API Key 一起送出（`Authorization` 由规范剥离，不在此列）。受影响的是：

- `index.mjs`：模型请求转发，同时带 `authorization` 和 `x-api-key`
- `lib/helpers.mjs`：`fetchJSON`（模型列表、余额）与 `fetchEfforts`
- `lib/account.mjs`：`accountRequest`（登录、刷新、读取账号）
- `lib/login.html`：登录页提交密码

现在这四处都显式设置 `redirect: "error"`，遇到重定向直接失败。`test/redirect.test.mjs` 覆盖请求转发、`fetchJSON` 和 `accountRequest` 三条路径，移除修复时测试会失败。

这不改变正常请求的行为：只有上游返回重定向时才会触发。

## 1.1.0

上游基线，对应 commit `0457efb`：账号登录、两步验证、分页同步全部可用 API Key、按模型路由到对应密钥、余额与分组额度展示。
