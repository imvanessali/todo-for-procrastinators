# Folio 配置清单（需要你完成的部分）

## 1. 创建 Supabase 项目

1. [supabase.com/dashboard](https://supabase.com/dashboard) → New project
2. **SQL Editor** → 粘贴执行 `supabase/migrations/0001_todos.sql`
3. **Settings → API** 拿到两个值：
   - Project URL → `SUPABASE_URL`
   - anon public key → `SUPABASE_ANON_KEY`

## 2. 填入 Key（两处）

| 文件 | 用途 |
|------|------|
| `.env.local`（复制自 `.env.local.example`） | 本地开发 |
| `wrangler.jsonc` → `vars` | 生产部署 |

把 `YOUR_SUPABASE_URL` / `YOUR_SUPABASE_ANON_KEY` 替换为真实值。

## 3. Google 登录（与 Foca 同款流程）

1. Supabase Dashboard → **Authentication → Providers** → 启用 **Google**
2. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建 OAuth 2.0 凭据，填入 Client ID / Secret
3. **Authentication → URL Configuration → Redirect URLs** 添加：
   - `http://localhost:3000/app`
   - `https://你的域名/app`

邮箱验证码登录开箱即用，无需额外配置（Supabase 默认开启 Email OTP）。

## 4. 建仓库

```bash
git remote add origin git@github.com:YOUR_USERNAME/folio.git   # TODO(you): 替换为你的仓库
git push -u origin main
```

## 5. 部署到 Cloudflare

```bash
npx wrangler login
npm run deploy
```

绑定自有域名：取消 `wrangler.jsonc` 中 `routes` 的注释并替换域名。
