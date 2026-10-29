// 凭据不能跟随重定向：307/302 会让 fetch 把请求发到响应头指定的地址，
// 而 x-api-key 不在 fetch 规范的敏感头剥离列表里，会原样送出去。
// 这里对三条带凭据的调用各起一个会重定向的上游，确认请求直接失败、落点收不到东西。

import assert from "node:assert/strict"
import { createServer } from "node:http"
import StringAIPlugin from "../index.mjs"
import { fetchJSON } from "../lib/helpers.mjs"
import { SITE, accountRequest } from "../lib/account.mjs"

const realFetch = globalThis.fetch
const sinkHits = []

// 重定向的落点：收到任何请求都记一笔，测试结束时应当始终为空
const sink = createServer((req, res) => {
  sinkHits.push({ url: req.url, auth: req.headers.authorization, apiKey: req.headers["x-api-key"] })
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end("{}")
})
await new Promise((done) => sink.listen(0, "127.0.0.1", done))
const sinkURL = `http://127.0.0.1:${sink.address().port}`

// 模拟上游：模型列表正常返回，其余路径一律 307 指向落点
const api = createServer((req, res) => {
  if (req.url.startsWith("/v1/models")) {
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify({ data: [{ id: "redirect-model" }] }))
  }
  res.writeHead(307, { Location: `${sinkURL}/sink` })
  res.end()
})
await new Promise((done) => api.listen(0, "127.0.0.1", done))
const apiURL = `http://127.0.0.1:${api.address().port}`

let failed = 0
async function check(name, run) {
  sinkHits.length = 0
  let threw = false
  try {
    await run()
  } catch {
    threw = true
  }
  const leaked = sinkHits.length > 0
  const ok = threw && !leaked
  console.log(`${ok ? "通过" : "失败"}  ${name}${leaked ? "  ← 凭据被送到重定向目标" : ""}`)
  if (!ok) failed++
}

// 1. 请求转发：这条同时带 Authorization 和 x-api-key
const plugin = await StringAIPlugin({}, { baseURL: `${apiURL}/v1` })
const loader = await plugin.auth.loader(async () => ({ type: "api", key: "sk-redirect-test" }))
await check("请求转发拒绝 307", () =>
  loader.fetch(`${apiURL}/v1/responses`, {
    method: "POST",
    headers: {},
    body: JSON.stringify({ model: "redirect-model" }),
  }),
)

// 2. 模型列表与余额查询
await check("fetchJSON 拒绝 307", () => fetchJSON(`${apiURL}/v1`, "/v1/usage", "sk-redirect-test"))

// 3. 账号登录与刷新：SITE 固定指向 string.ink，这里把请求转到本地 307 上游
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url)
  return url.origin === SITE
    ? realFetch(`${apiURL}${url.pathname}${url.search}`, init)
    : realFetch(input, init)
}
try {
  await check("accountRequest 拒绝 307", () => accountRequest("/auth/me", { token: "session-token" }))
} finally {
  globalThis.fetch = realFetch
}

sink.close()
api.close()
assert.equal(failed, 0, `${failed} 项未通过`)
console.log("全部通过：三条带凭据的调用都不跟随重定向。")
