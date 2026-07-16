# 轻松俄罗斯方块

这是一个基于微信小游戏纯 `JS` 模板改造的本地单机拖拽消除小游戏。  
项目保留了微信小游戏原有启动方式和开发者工具配置，没有修改 `AppID`，也没有接入广告、排行榜、支付、云开发或任何真实后端服务。

## 当前功能

1. 启动后先进入主页，不会直接开始新局。
2. 游戏是 `10×10` 棋盘的无尽模式。
3. 当前支持三档难度：
   - 简单
   - 普通
   - 大师
4. 默认难度是 `普通`。
5. 不同难度会影响：
   - 出块形状池
   - 复杂形状概率
   - 道具次数
6. 当前支持三个本地单机道具：
   - 刷新
   - 清除
   - 撤回
7. 游戏内提供暂停入口，可继续游戏、重新开始或返回主页。
8. 最高分按难度分别保存在本地。
9. 当前新增了会员系统原型和管理员模式原型。

## 主页

主页显示：

1. 游戏标题：`轻松俄罗斯方块`
2. 当前难度对应的最高分
3. 当前难度：`难度：简单 / 普通 / 大师`
4. 按钮：
   - `开始游戏`
   - `怎么玩`
   - `设置`

点击难度区域后，会在 `简单 -> 普通 -> 大师 -> 简单` 之间循环切换。  
注意：

1. 启动后只显示主页，不会提前开始新局。
2. 只有点击 `开始游戏` 后，才会真正生成棋盘和候选方块。
3. 游戏结束后点击 `重新开始`，会直接开始当前难度的新一局，不回主页。

## 基础玩法

1. 底部每轮会出现 `3` 个候选方块。
2. 拖动候选方块到棋盘内，只有不越界、且不覆盖已有方块时才能放下。
3. 放置成功后，对应候选方块会消失。
4. 三个候选方块全部用完后，会生成下一组。
5. 任意整行或整列填满后会自动消除。
6. 游戏为无尽模式，没有关卡、目标分数或进度条。
7. 当前候选方块全部无法继续放入棋盘时，游戏结束。

## 三档难度

### 简单

目标：轻松、顺滑，适合新手和休闲游玩。

允许形状：

- 单格
- 横向 2
- 竖向 2
- 横向 3
- 竖向 3
- 横向 4
- 竖向 4
- `2×2`
- 小 `L3` 四方向
- 4 格 L 形小拐角四方向

禁止形状：

- `Z`
- 反 `Z`
- 阶梯
- 所有 `T`
- `L5`
- `T5`
- 十字 5
- `3×3`
- 长条 5

权重：

- 救场块：`40%`
- 简单块：`35%`
- 中等块：`25%`

额外限制：

1. 每组 3 个候选块至少 1 个救场块。
2. 每组最多 2 个中等块。
3. 不允许 3 个全是中等块。
4. 不允许一组里 3 个都特别小。
5. 单格每组最多出现 1 个。

默认道具次数：

- `刷新 ×3`
- `清除 ×1`
- `撤回 ×1`

### 普通

目标：默认推荐，有策略压力，但不恶心玩家。

允许形状：

- 简单模式全部形状
- `T4 / T5`
- `L5`
- `3×3`
- 长条 5
- 十字 5
- `Z`
- 反 `Z`
- 阶梯

权重：

- 救场块：`35%`
- 简单块：`37%`
- 中等块：`20%`
- 高难块：`8%`

蛇形块规则：

1. `Z / 反Z / 阶梯` 的总概率已经下调。
2. 它们只作为高难块中的极低概率项出现。
3. 一组候选块里最多出现 1 个蛇形块。
4. 如果上一组已经出现过蛇形块，下一组会尽量不再出现蛇形块。

默认道具次数：

- `刷新 ×2`
- `清除 ×1`
- `撤回 ×1`

### 大师

目标：挑战模式，压力更高。

允许形状：

- 所有简单、中等、高难形状
- `Z`
- 反 `Z`
- 阶梯
- 所有 `T`
- `L5`
- 十字 5
- `3×3`
- 长条 5

权重：

- 救场块：`20%`
- 简单块：`25%`
- 中等块：`30%`
- 高难块：`25%`

默认道具次数：

- `刷新 ×1`
- `清除 ×0`
- `撤回 ×1`

## 候选块保底规则

所有难度都保留公平性：

1. 新候选块生成后，会立刻检查当前棋盘上是否至少有 `1` 个候选块可以放下。
2. 如果 3 个候选块都无法放置，会自动整组重抽。
3. 最多重试 `20` 次。
4. 普通补新组时，20 次都失败，才会进入 `Game Over`。
5. 刷新道具也使用同样的保底逻辑。
6. 如果刷新失败：
   - 不扣次数
   - 不结束游戏
   - 保留原候选块

## 道具说明

这三个道具都是本地单机功能，不涉及广告、付费、登录、商城或后端。

### 刷新

- 文案：`刷新 ×N`
- 作用：重新生成当前 3 个候选块
- 不改变棋盘
- 只有刷新成功才会扣次数

### 清除

- 文案：`清除 ×N`
- 作用：清除点击位置附近 `3×3` 有效区域内已有方块
- 不加分
- 不触发清线奖励
- 不触发连消
- 只作为救场工具

### 撤回

- 文案：`撤回 ×N`
- 作用：撤销最近一次成功放置
- 会恢复到那次放置之前的局面
- 如果那次放置本来会触发清线，撤回后也会回到清线发生前
- 不会影响历史最高分和用户设置

## 会员系统原型

当前版本加入了本地会员原型，但这不是正式付费会员能力。

### 当前规则

1. 非会员每局 `0` 次免死金牌。
2. 会员每局 `2` 次免死金牌。
3. 会员状态当前仅是本地原型开关，不代表真实购买关系。
4. 设置面板会显示：
   - `会员状态：未开启`
   - `会员状态：已开启`
5. 当前不提供购买、充值、支付或开通会员入口。

### 免死触发

当系统判断当前局即将 `Game Over` 时：

1. 如果会员还有剩余免死次数，会弹出确认层：
   - 标题：`使用免死金牌？`
   - 说明：`本局还可免死 x 次`
   - 按钮：`使用`、`放弃`
2. 点击 `使用` 后：
   - 消耗 1 次免死
   - 先尝试重新生成一组可放置候选块
   - 如果仍无解，则随机清除棋盘上少量已有方块，再重抽候选块
   - 不加分
   - 不触发清线奖励
   - 不触发连消
3. 点击 `放弃` 后，正常进入 `Game Over`

说明：正式上线前，会员身份应改为真实后端校验，并走合规支付流程。

## 管理员模式原型

当前版本加入了隐藏的管理员模式原型，只用于开发测试，不面向普通玩家。

### 当前入口

1. 只在主页生效。
2. 在主页标题 `轻松俄罗斯方块` 上连续点击 7 次，可打开管理员验证面板。
3. 游戏中不会触发，避免误操作。

### 当前验证

本轮仅实现本地原型验证，不接真实后端。  
正式版不能只依赖前端隐藏码，必须改成服务端校验。

### 正式版推荐校验方案

正式版建议流程：

1. 前端调用 `wx.login()` 获取临时 `code`
2. 前端把 `code + 管理员码` 发给云托管 Express 后端
3. 后端用 `code` 换取 `openid`
4. 后端同时校验：
   - 管理员码是否正确
   - `openid` 是否在管理员白名单里
5. 后端只返回是否允许管理员模式，不返回 `session_key`

建议环境变量：

- `ADMIN_MODE_ENABLED`
- `ADMIN_CODES`
- `ADMIN_OPENIDS`
- `WECHAT_APPID`
- `WECHAT_SECRET`

### 当前能力

管理员模式开启后：

1. 刷新无限
2. 清除无限
3. 撤回无限
4. 免死金牌无限
5. 可以低调显示 `管理员模式`
6. 当前局分数不会写入正式最高分

### 关闭方式

设置面板里如果管理员模式已开启，会显示：

- `管理员模式：已开启`
- `关闭管理员模式`

关闭后：

1. 恢复正常道具次数
2. 恢复正常免死规则
3. 管理员模式期间的分数不会补写入正式最高分

### 上架前要求

正式上架前必须二选一：

1. 把本地管理员入口关闭
2. 或替换成服务端管理员校验

管理员模式下的分数不计入正式最高分。

## 暂停与返回主页

游戏界面内新增了一个小型 `暂停` 按钮。

点击后会打开暂停面板，包含：

1. `继续游戏`
2. `重新开始`
3. `返回主页`

规则：

1. 打开暂停面板时，拖拽输入会被锁定。
2. 暂停面板不会点击穿透到棋盘、候选块或道具栏。
3. 点击 `继续游戏`：关闭暂停面板，恢复当前局。
4. 点击 `重新开始`：直接开始当前难度的新一局，不回主页。
5. 点击 `返回主页`：会先弹出确认提示：
   - `返回主页将结束本局，是否继续？`
6. 确认后返回主页，但保留：
   - 当前难度设置
   - 最高分
   - BGM 设置
   - 音效设置
   - 震动设置
   - 会员状态原型开关

## 计分规则

1. 放置方块：每个小格 `+10`
2. 消除一行或一列：每条线 `+100`
3. 同时消除多条线：额外奖励 `线数 × 线数 × 50`

## 最高分保存方式

当前最高分按难度分别保存，结构类似：

```js
{
  easy: 0,
  normal: 0,
  master: 0
}
```

说明：

1. 简单、普通、大师三档最高分互不影响。
2. 主页显示“当前选中难度”的最高分。
3. 游戏顶部只显示“当前这一局难度”的最高分。
4. 游戏结束弹层也只显示“当前难度最高分”。
5. 旧版本如果只有单一最高分，会自动迁移到 `normal`。
6. 当前没有排行榜，所有分数只保存在本地。
7. 当前最高分属于“本地单机记录”。
8. 管理员模式下的分数不会写入正式最高分。

## 音效与背景音乐

### 正式短音效

```text
audio/
  pickup.mp3
  place.mp3
  clear.mp3
  combo.mp3
  combo3.mp3
  click.mp3
  gameover.mp3
```

旧射击模板音频 `boom.mp3`、`bullet.mp3` 和 `bgm_template_old.mp3` 已从微信发布目录移除。当前发布目录只保留下方正式音效和 4 首背景音乐。

### 4 首可选背景音乐

```text
audio/bgm_1.mp3：高亢
audio/bgm_2.mp3：电子
audio/bgm_3.mp3：兴奋
audio/bgm_4.mp3：活跃
```

说明：

1. 背景音乐默认关闭。
2. 默认选择 `音乐二 · 电子`。
3. 主页、游戏、帮助、设置、暂停之间切换时不会重复叠加 BGM。
4. `wx.onHide / wx.onShow` 的前后台恢复逻辑继续有效。

### 音频来源登记

| 文件 | 用途 | 状态 | 备注 |
| --- | --- | --- | --- |
| `audio/bgm_1.mp3` | 背景音乐一 | AI 生成候选 / 来源待确认 | 正式上架前必须确认版权和商用授权，或替换为明确可商用素材 |
| `audio/bgm_2.mp3` | 背景音乐二 | AI 生成候选 / 来源待确认 | 正式上架前必须确认版权和商用授权，或替换为明确可商用素材 |
| `audio/bgm_3.mp3` | 背景音乐三 | AI 生成候选 / 来源待确认 | 正式上架前必须确认版权和商用授权，或替换为明确可商用素材 |
| `audio/bgm_4.mp3` | 背景音乐四 | AI 生成候选 / 来源待确认 | 正式上架前必须确认版权和商用授权，或替换为明确可商用素材 |

## 设置面板

当前设置面板包含：

1. `当前难度`
2. `音效：开 / 关`
3. `背景音乐：开 / 关`
4. `背景音乐选择`
5. `震动反馈：开 / 关`
6. `会员状态：已开启 / 未开启`
7. `管理员模式：已开启 / 未开启`
8. `关闭管理员模式`（仅管理员模式开启时显示）
9. `重置当前难度最高分`
10. `继续游戏`

说明：

1. 音效和背景音乐是两个独立开关。
2. 背景音乐默认关闭。
3. 不同难度的最高分分开保存。
4. 重置最高分只会重置“当前难度”的最高分。
5. 当前会员状态只是本地原型开关。

## 本地存储

当前使用两组本地存储：

1. `block_puzzle_best_scores_v1`
   - 保存三档难度的最高分
2. `block_puzzle_settings_v1`
   - 保存 `soundEnabled`
   - 保存 `bgmEnabled`
   - 保存 `vibrationEnabled`
   - 保存 `bgmTrack`
   - 保存 `difficulty`
   - 保存 `memberEnabled`

管理员模式本轮不做持久化，关闭小游戏后默认失效。

## 项目结构

```text
game.js
game.json
project.config.json
project.private.config.json
audio/
images/
js/
  main.js
  render.js
  game/
    constants.js
    Board.js
    Piece.js
    GameState.js
    Renderer.js
    InputManager.js
    ScoreManager.js
    SoundManager.js
  utils/
    storage.js
```

## 如何运行

1. 打开微信开发者工具
2. 选择小游戏项目
3. 打开目录：

```text
we xin xiao cheng xu
```

4. 等待项目加载完成
5. 点击编译或直接运行预览

## 如何测试

### 基础流程

1. 启动后先看到主页
2. 点击难度区域，检查是否能在 `简单 -> 普通 -> 大师` 之间循环切换
3. 点击 `开始游戏` 后进入新局
4. 顶部显示当前分数、当前难度和当前难度最高分
5. 棋盘固定为 `10×10`
6. 底部每轮显示 3 个候选方块
7. 可以正常拖拽、放置、清线、结束和重新开始

### 暂停入口

1. 游戏中点击 `暂停`
2. 检查是否弹出暂停面板
3. 检查暂停面板是否包含：
   - `继续游戏`
   - `重新开始`
   - `返回主页`
4. 点击 `返回主页` 时，检查是否出现二次确认
5. 暂停面板打开时，检查是否不能点穿透到棋盘、候选块和道具栏

### 难度

1. 简单模式不应出现高难蛇形块
2. 普通模式应比简单模式形状更丰富
3. 大师模式应允许更复杂的组合
4. 三档难度的道具次数应分别不同
5. 三档难度的最高分应彼此独立

### 会员免死

1. 非会员每局应为 `0` 次免死
2. 开启会员后，每局应为 `2` 次免死
3. 即将结束时，如有免死次数，应弹出确认层
4. 使用免死后应继续当前局，不触发额外得分与连消

### 管理员模式

1. 主页标题连续点击 7 次，应打开管理员验证面板
2. 输入错误时显示 `验证失败`
3. 输入正确后应进入管理员模式
4. 管理员模式下：
   - 刷新无限
   - 清除无限
   - 撤回无限
   - 免死无限
5. 管理员模式下的分数不应写入正式最高分
6. 在设置中可关闭管理员模式

### 设置与音频

1. 测试音效开关：关闭后短音效应停止
2. 测试背景音乐开关：开启后播放当前选中 BGM，关闭后立即停止
3. 测试背景音乐选择：应能在 4 首音乐之间循环切换
4. 测试主页、游戏、帮助、设置、暂停切换时 BGM 不应重复叠加
5. 测试进后台再回前台：如果 BGM 开关是开，应恢复当前那一首

## 注意事项

1. 本项目只做本地单机版
2. 不会上传代码，也不会提交审核
3. 不会接入真实支付、广告、排行榜、登录、商城或后端
4. 当前管理员模式和会员状态都只是本地原型
5. 正式上线前：
   - 会员身份需要接后端和合规支付
   - 管理员验证必须改成服务端校验
   - 本地管理员入口必须关闭或替换
6. 游戏内不使用受限经典游戏名称作为 UI 文案
7. 旧射击模板代码和未映射音频已清理；当前入口只使用正式拼图实现和资源映射中的音频

## 2026-05 Silent Login Integration

This version now supports minimal WeChat silent login with the cloud-hosted Express backend, while still keeping the game locally playable when login fails.

### Frontend behavior

1. The game tries `wx.login()` on startup.
2. It then calls the cloud container backend with `wx.cloud.callContainer()`.
3. The frontend only stores safe state returned by the backend:
   - `loggedIn`
   - `userId`
   - `isMember`
   - `isAdminAllowed`
4. The frontend does not store `session_key`.
5. The frontend does not contain `AppSecret`.
6. If login fails, local gameplay still works.

### Frontend config

Frontend cloud config is in `js/config/backend.js`.

It contains only non-sensitive values:

- `CLOUD_ENV`
- `CLOUD_SERVICE_NAME`
- `API_BASE_PATH`

Use placeholders until real values are known:

- `YOUR_CLOUD_ENV_ID`
- `YOUR_CLOUD_SERVICE_NAME`

### Backend endpoints

Backend folder:

- `weixin-block-backend`（独立后端项目，不属于本仓库）

Current endpoints:

1. `GET /api/health`
2. `POST /api/login`
3. `POST /api/admin/verify`

### Member and admin rules

1. Member state now comes from backend `isMember`.
2. Non-members get `0` revives per round.
3. Members get `2` revives per round.
4. Admin verification now goes through the backend endpoint.
5. If backend verification is unavailable, admin mode cannot be enabled.
6. Admin mode still keeps:
   - infinite refresh
   - infinite clear
   - infinite undo
   - infinite revive
   - score does not write into official local best score

### Required configuration

Frontend cloud config:

- `CLOUD_ENV`
- `CLOUD_SERVICE_NAME`

Backend environment variables:

- `WECHAT_APPID`
- `WECHAT_SECRET`
- `ADMIN_OPENIDS`
- `ADMIN_CODES`
- `MEMBER_OPENIDS`

### Security notes

1. Do not put any real secret into frontend code.
2. Do not put any real secret into README.
3. Do not put any real admin code into frontend code.
4. Do not put any real `openid` into frontend code.

## 2026-05 Security Cleanup Status

Current frontend and backend connection status:

1. Silent login still starts with `wx.login()`.
2. The frontend then requests backend `POST /api/login`.
3. Member state still comes from backend `isMember`.
4. Admin verification still goes through backend `POST /api/admin/verify`.
5. The frontend does not keep a local real admin password.

Current security rules:

1. Do not put real `ADMIN_CODES` into frontend code.
2. Do not put real `ADMIN_OPENIDS` or `MEMBER_OPENIDS` into frontend code.
3. Do not put real `WECHAT_SECRET` into frontend code.
4. Do not display or log `openid`, `session_key`, admin code, or real secret values.

Admin mode rules kept unchanged:

1. Admin mode uses backend verification.
2. Admin mode score does not write into official best score.
3. Admin mode keeps infinite revive.
4. After admin mode is turned off, normal tool limits and revive rules apply again.

Member rules kept unchanged:

1. Non-member: `0` revives per round.
2. Member: `2` revives per round.
3. Admin: infinite revive.

Logging cleanup:

1. Removed verbose `[Auth]` development logs from normal runtime.
2. Login failure still shows a short safe error message in game state.
3. Local gameplay still works when backend login fails.

## 2026-05 Cloud Container Access Notes

Current frontend request strategy:

1. Prefer `wx.cloud.callContainer()` for formal Mini Game access.
2. Use full official parameters:
   - `config.env = "prod-d9g0a944o277cc4da"`
   - header `X-WX-SERVICE = "express-4nez"`
3. If `callContainer` is unavailable or not fully configured, fallback to public `wx.request`.
4. Public `wx.request` is kept only as a development backup path.

Current local config values:

1. AppID in `project.config.json`: `wx347500290c0f48fd`
2. Cloud env in `js/config/backend.js`: `prod-d9g0a944o277cc4da`
3. Cloud service name in `js/config/backend.js`: `express-4nez`

If `callContainer` still reports `INVALID_HOST`, check these items in the console:

1. The Mini Game AppID must match the AppID that is actually associated with the target CloudBase environment.
2. The Mini Game must be associated with the target cloud environment.
3. If the environment belongs to another app under the same subject, enable environment sharing / resource sharing first.
4. Confirm the target service name is exactly `express-4nez`.
5. Confirm you are calling the same environment `prod-d9g0a944o277cc4da`.

Release note:

1. If `callContainer` works, keep it as the formal production path.
2. If `callContainer` still cannot be used, keep `wx.request` temporarily.
3. If the final formal path remains public `wx.request`, production release will need a custom domain and备案.

## 2026-05 Local Membership Code Update

This version changes only the member enable path. Core gameplay, admin verification, silent login, BGM, best score, difficulty, and tool system stay unchanged.

Current member rules:

1. Frontend member state no longer depends on backend `isMember`.
2. Frontend member state now comes from local settings field `localMembershipEnabled`.
3. After entering a correct membership code, local member state becomes enabled and stays saved after closing and reopening the Mini Game.
4. Member benefit is still `2` revives per round.
5. Non-member still gets `0` revives per round.
6. Admin mode still has infinite revive and higher priority than member mode.

Membership code rules:

1. Membership codes are local welfare codes only.
2. Current local config entry is `MEMBERSHIP_CODES` in `js/game/constants.js`.
3. Input trims leading and trailing spaces.
4. Input comparison is case-insensitive.
5. Membership codes must not be logged.
6. Membership codes must not be sent to backend.
7. Membership codes must not be mixed with admin codes.

Settings panel behavior:

1. Shows `会员状态：已开启 / 未开启`.
2. Shows `输入会员码` entry.
3. After enabled, also shows `会员福利：每局 2 次免死`.
4. After enabled, also shows `关闭本地会员`.

Help page copy:

1. Use `输入会员码后，每局获得 2 次免死机会。`
2. Do not describe member mode as purchase, recharge, subscription, or paid VIP.
