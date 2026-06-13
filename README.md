# Folio

像笔记本一样的待办工具：左页今天，右页明天。未完成自动顺延，支持搜索与甘特图。

技术栈（与 Foca 对齐）：静态前端 + Supabase（Google OAuth / 邮箱 OTP + Postgres 存储）+ Cloudflare Worker 部署 + Express 本地开发。

## 本地运行

```bash
npm install
npm run dev        # http://localhost:3000
```

未配置 Supabase 时为本地试用模式（数据存浏览器 localStorage），配置后自动启用账号与云端存储。完整配置见 [SETUP.md](SETUP.md)。

## 结构

```
index.html              官网
app.html                应用（笔记本 / 甘特图）
assets/                 styles.css · auth.js · store.js · app.js
server.js               本地开发服务器（静态资源 + /api/config）
worker.js               Cloudflare Worker（与 server.js 同一契约）
wrangler.jsonc          部署配置（含待填 placeholder）
supabase/migrations/    数据库建表 SQL
```

## 许可

[PolyForm Noncommercial License 1.0.0](LICENSE) — 允许查看、修改、非商业使用，禁止商业用途。商业授权请联系作者。

