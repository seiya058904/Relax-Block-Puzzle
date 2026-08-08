# weixin-block-backend

这是一个独立的微信云托管 Express 后端目录，专门给当前微信小游戏提供最小登录、管理员验证和会员状态接口。

这个后端当前只做 3 个接口：

1. `GET /api/health`
2. `POST /api/login`
3. `POST /api/admin/verify`

它不会接入以下能力：

1. 支付
2. 广告
3. 排行榜
4. 云端最高分

## 目录说明

- `package.json`
  这是项目清单文件，用来声明这个后端项目依赖什么包、怎么启动。
- `app.js`
  这是 Express 应用本体，里面放接口逻辑。
- `server.js`
  这是启动入口，作用是把 `app.js` 真正跑起来。

## 环境变量

下面这些值都必须配置在微信云托管环境变量里，不要写进代码，不要提交真实值：

- `WECHAT_APPID`
- `WECHAT_SECRET`
- `ADMIN_OPENIDS`
- `ADMIN_CODES`
- `MEMBER_OPENIDS`

推荐格式：

### 方式一：逗号分隔

```text
ADMIN_OPENIDS=openid_a,openid_b
ADMIN_CODES=code_a,code_b
MEMBER_OPENIDS=openid_x,openid_y
```

### 方式二：JSON 数组

```json
["value_a", "value_b"]
```

后端会自动识别这两种格式。

## 接口说明

### 1. 健康检查

路径：

```text
GET /api/health
```

返回：

```json
{
  "ok": true
}
```

作用：
这是最简单的“活着吗”检查接口。可以把它理解成门卫点头，说“服务还在正常上班”。

### 2. 登录接口

路径：

```text
POST /api/login
```

请求体：

```json
{
  "code": "wx.login 返回的 code"
}
```

后端处理流程：

1. 读取环境变量里的 `WECHAT_APPID` 和 `WECHAT_SECRET`
2. 调用微信 `code2Session`
3. 获取 `openid`
4. 用 `openid` 生成安全哈希 `userId`
5. 根据 `MEMBER_OPENIDS` 判断是否会员
6. 根据 `ADMIN_OPENIDS` 判断是否管理员候选
7. 不把 `session_key` 返回给前端

返回示例：

```json
{
  "loggedIn": true,
  "userId": "openid 安全哈希",
  "isMember": true,
  "isAdminAllowed": false
}
```

如果微信登录失败，接口会返回降级结果，方便前端继续本地游玩逻辑。

### 3. 管理员验证接口

路径：

```text
POST /api/admin/verify
```

请求体：

```json
{
  "code": "wx.login 返回的 code",
  "adminCode": "用户输入的管理员码"
}
```

后端处理流程：

1. 用 `code` 换取 `openid`
2. 检查这个 `openid` 是否在 `ADMIN_OPENIDS`
3. 检查输入的 `adminCode` 是否在 `ADMIN_CODES`
4. 两者都通过才返回 `adminMode: true`

返回示例：

```json
{
  "adminMode": true
}
```

## 本地启动

先安装依赖：

```bash
npm install
```

再启动：

```bash
npm start
```

默认端口：

```text
3000
```

也可以通过环境变量 `PORT` 指定端口。

## 本地测试示例

### 健康检查

```bash
curl http://localhost:3000/api/health
```

### 登录接口

```bash
curl -X POST http://localhost:3000/api/login ^
  -H "Content-Type: application/json" ^
  -d "{\"code\":\"test-code\"}"
```

### 管理员验证接口

```bash
curl -X POST http://localhost:3000/api/admin/verify ^
  -H "Content-Type: application/json" ^
  -d "{\"code\":\"test-code\",\"adminCode\":\"test-admin-code\"}"
```

## 当前阶段边界

当前阶段只创建独立后端，不改小游戏主逻辑，所以：

1. 不影响小游戏本地离线可玩
2. 不把后端代码混进前端根目录
3. 不保存 `session_key`
4. 不写入真实密钥、真实管理员码、真实 `openid`
## 2026-05 Security Cleanup Status

Current backend integration status:

1. WeChat silent login is enabled through `POST /api/login`.
2. Member state comes from backend `isMember`.
3. Admin verification comes from backend `POST /api/admin/verify`.
4. Real admin codes and openid white lists must be configured only in cloud environment variables.
5. Do not write any real secret into code or README.

Current environment variables:

- `WECHAT_APPID`
- `WECHAT_SECRET`
- `ADMIN_OPENIDS`
- `ADMIN_CODES`
- `MEMBER_OPENIDS`

Current dev openid status:

1. `/api/dev/openid` has been deleted from the backend code.
2. `DEV_OPENID_LOOKUP_ENABLED` is no longer needed in the current backend code.
3. Before official release, keep the dev openid capability deleted or disabled.

Logging policy:

1. Normal login flow no longer prints verbose debug logs.
2. Error logs are kept only for backend failures such as `code2Session` request failure, HTTP failure, or invalid response.
3. Logs must not print AppSecret, `session_key`, full `openid`, or admin code.

## 2026-05 Local Membership Code Note

Current member behavior has changed on the frontend side:

1. The Mini Game frontend no longer uses backend `isMember` as the formal member switch.
2. Formal member enable now uses a local membership code and local storage persistence.
3. The frontend does not send membership codes to this backend.
4. The frontend does not use `MEMBER_OPENIDS` as the formal member decision anymore.
5. `POST /api/login` may still return `isMember` for compatibility, but the frontend should ignore it for member revive rules.

Current backend impact:

1. `POST /api/login` stays unchanged.
2. `POST /api/admin/verify` stays unchanged.
3. `MEMBER_OPENIDS` is no longer the main member-system source of truth.
4. `MEMBER_OPENIDS` can be kept temporarily for compatibility and may be deleted in a later cleanup.
