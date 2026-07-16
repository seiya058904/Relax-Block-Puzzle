# 微信小游戏与 Android APK 双版本一致性审计

审计日期：2026-06-15  
审计范围：

- 微信小游戏：`we xin xiao cheng xu/`
- Android APK：`we xin xiao cheng xu-android-apk/`

本报告只基于当前工作区中的源代码、配置、资源和静态检查结果。没有修改两个项目中的任何现有文件，也没有把任意一方默认认定为主版本。

## 1. 结论摘要

两个版本仍然拥有高度相似的游戏主体，但已经在平台服务、交互反馈和渲染运行方式上分叉。

可以直接确认的共同基础：

- 棋盘规则 `Board.js`、方块库与生成规则 `Piece.js`、存档逻辑 `storage.js` 为字节级完全一致。
- 计分公式、三档难度、方块生成概率、候选方块保底、道具次数、清除逻辑、撤回范围、会员复活次数和最高分资格规则一致。
- 两边当前游戏实际引用的 11 个音频文件字节级完全一致。

主要差异：

- 微信版包含微信登录、后端健康检查和服务端管理员验证；Android 版是离线 WebView 应用，不执行这些网络认证流程。
- 微信版包含消除得分文字、分数脉冲和新纪录提示；Android 版没有这些得分视觉反馈。
- Android 版包含拖动抬升/缩放动画、拖动时隐藏候选区原块、按需渲染、DPR 限制、应用前后台暂停恢复和停止残留音效等改进。
- Android 版福利码输入使用画布内自绘键盘，并保留隐藏 HTML 输入框兼容逻辑；微信版使用微信键盘 API。
- Android 私测 APK 允许本地开启管理员模式；微信版要求服务端验证。该差异属于平台实现/产品策略差异，不是当前代码融合的阻断级安全问题。

推荐目标不是复制其中一个版本，而是保留共同规则核心，统一事件和表现状态，再分别维护微信与 Android 的平台适配。

## 2. 审计方法与结论等级

### 2.1 方法

1. 从平台启动入口追踪实际 import 和运行调用链。
2. 对同路径代码执行 SHA-256 比较，而不是仅比较文件名。
3. 对不同文件逐项比较函数、状态字段、公式和事件。
4. 对二进制资源比较文件大小和 SHA-256。
5. 对两边 JavaScript 执行静态语法检查。
6. 尝试 Android Gradle 构建，但构建被 Windows 中文路径检查提前阻止。

### 2.2 结论状态

- **代码确认**：可从当前源代码、哈希或配置直接证明。
- **需要平台验证**：静态代码可说明意图，但触摸、音频、DPR、生命周期等实际结果需要运行环境证明。
- **需要产品决策**：两种行为都可成立，代码无法决定最终产品规则。

### 2.3 风险等级

- **低**：主要是文案、视觉或无运行影响的遗留内容。
- **中**：可能造成体验、存档、平台行为或维护成本差异。
- **高**：可能造成游戏规则、成绩资格、权限策略或核心流程不一致。

本报告没有把 Android 本地管理员模式定为阻断级安全风险，因为当前 APK 的使用场景是私下传播与测试，而非公开运营。

## 3. 技术栈与运行方式

| 项目 | 微信小游戏版本 | Android APK 版本 |
|---|---|---|
| 主体语言 | 原生 JavaScript ES Modules | Kotlin 外壳 + WebView 内的 JavaScript ES Modules |
| UI/绘制 | 微信小游戏 Canvas 2D | HTML Canvas 2D，运行在 Android WebView |
| 平台 API | 微信 `wx` API | `browser-wx-shim.js` 模拟必要的 `wx` API |
| 原生层 | 无独立原生应用层 | Kotlin `MainActivity`、AndroidX WebView、View Binding |
| 构建工具 | 微信开发者工具 | Gradle Kotlin DSL、Android Gradle Plugin |
| 存储介质 | 微信 Storage：`wx.getStorageSync/setStorageSync` | WebView `localStorage`，由 shim 映射成相同的 `wx` 存储接口 |
| 网络/身份 | 微信登录、CloudBase/请求后端 | 当前正式启动链不导入认证客户端；本地离线运行 |
| 运行方式 | 微信开发者工具打开项目根目录，按“编译” | Gradle 构建 APK，Activity 加载打包的 `index.html` |
| 屏幕方向 | `game.json` 配置竖屏 | Manifest 配置 portrait |

Android 构建配置：`compileSdk 34`、`minSdk 26`、`targetSdk 34`、Java/Kotlin 17、版本名 `1.0.3`。

## 4. 启动入口、真正执行入口与调用链

### 4.1 微信版正式调用链

```text
game.js
  -> initCloud()                         js/api/AuthClient.js
  -> new Main()                          js/main.js
       -> loadSettings()                 js/utils/storage.js
       -> new GameState()                js/game/GameState.js
            -> Board                     js/game/Board.js
            -> ScoreManager              js/game/ScoreManager.js
            -> createRack                js/game/Piece.js
       -> new Renderer()                 js/game/Renderer.js
       -> new SoundManager()             js/game/SoundManager.js
       -> new AuthClient()               js/api/AuthClient.js
       -> new InputManager()             js/game/InputManager.js
       -> requestAnimationFrame loop
```

平台启动入口是 `game.js`，真正的游戏编排入口是 `js/main.js` 的 `Main` 类。核心规则入口是 `GameState`，不是模板目录中的旧游戏代码。

### 4.2 Android 正式调用链

```text
AndroidManifest.xml
  -> MainActivity.onCreate()             MainActivity.kt
       -> WebViewAssetLoader
       -> loadUrl(.../assets/index.html)
            -> browser-wx-shim.js
            -> game.js
                 -> new Main()           assets/js/main.js
                      -> GameState / Renderer / InputManager / SoundManager
                      -> storage.js / Board.js / Piece.js / ScoreManager.js
```

Android 的平台启动入口是 `MainActivity.kt`，网页启动入口是 `index.html`，游戏真正执行入口是 `app/src/main/assets/js/main.js`。Kotlin 层不实现游戏规则，只负责 WebView、资源加载和 Android 生命周期转发。

### 4.3 正式流程、未调用代码和遗留内容

**微信版正式流程中使用：**

- `game.js`
- `js/main.js`、`js/render.js`
- `js/game/*`
- `js/utils/storage.js`
- `js/api/AuthClient.js`
- `js/config/backend.js`（由认证客户端使用）
- 运行时音频表中引用的 11 个音频文件

**微信版旧射击模板清理结果：**

旧 `js/base/`、`js/player/`、`js/npc/`、`js/runtime/`、`js/databus.js` 和 `js/libs/tinyemitter.js` 已完成静态入口、动态路径、配置和测试检查，并于 2026-07-16 移除。

旧音频清理结果见 9.2；资源验证现在要求发布目录内每个音频都来自资源映射。

**Android 正式流程中使用：**

- `MainActivity.kt`、Manifest、布局和主题
- `index.html`、`browser-wx-shim.js`、`game.js`
- `assets/js/main.js`、`render.js`、`game/*`、`utils/storage.js`
- `assets/audio/` 中 11 个音频
- `res/drawable/app_icon.png`

**Android 仓库根目录图片：**没有被 Manifest、HTML、CSS、Kotlin 或 JavaScript 正式调用链引用；其中一张与应用图标哈希相同。它们属于仓库辅助/发布素材，不应被误判为游戏运行资源。

## 5. 主要目录映射

| 职责 | 微信版 | Android 版 |
|---|---|---|
| 平台启动 | `game.js` | `app/src/main/AndroidManifest.xml`、`MainActivity.kt` |
| Web/游戏启动 | 不适用 | `assets/index.html`、`assets/game.js` |
| 平台兼容层 | 直接使用 `wx` | `assets/browser-wx-shim.js` |
| 应用编排 | `js/main.js` | `assets/js/main.js` |
| 屏幕参数 | `js/render.js` | `assets/js/render.js` |
| 游戏状态与规则 | `js/game/GameState.js` | `assets/js/game/GameState.js` |
| 棋盘 | `js/game/Board.js` | `assets/js/game/Board.js` |
| 方块生成 | `js/game/Piece.js` | `assets/js/game/Piece.js` |
| 计分 | `js/game/ScoreManager.js` | `assets/js/game/ScoreManager.js` |
| 绘制 | `js/game/Renderer.js` | `assets/js/game/Renderer.js` |
| 输入 | `js/game/InputManager.js` | `assets/js/game/InputManager.js` |
| 音频 | `js/game/SoundManager.js` | `assets/js/game/SoundManager.js` |
| 存档 | `js/utils/storage.js` | `assets/js/utils/storage.js` |
| 身份/后端 | `js/api/AuthClient.js`、`js/config/backend.js` | 当前正式调用链无对应认证模块 |
| 音频资源 | `audio/` | `assets/audio/` |
| Android 原生资源 | 不适用 | `res/` |

## 6. 字节级完全一致的代码证据

以下文件两边大小和 SHA-256 均一致，因此可复核地认定为当前快照下字节级完全一致。

| 代码职责 | 微信路径 | Android 路径 | 大小（字节） | SHA-256 |
|---|---|---|---:|---|
| 存档与默认设置 | `we xin xiao cheng xu/js/utils/storage.js` | `we xin xiao cheng xu-android-apk/app/src/main/assets/js/utils/storage.js` | 3,101 | `D324B040C73CEA477DD7777431CD0277CAC4884A69D1CBB063858A3C2CC0E8BF` |
| 棋盘规则 | `we xin xiao cheng xu/js/game/Board.js` | `we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/Board.js` | 4,656 | `122A4114ABE3EE407105EC99E1BB4C7375926403CE27882F7894D3017C3B5763` |
| 方块库与生成 | `we xin xiao cheng xu/js/game/Piece.js` | `we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/Piece.js` | 12,965 | `DCE576B27F15AAE5BF7E80ED279F09B9295AD1E13E51B888680A083D02F12B75` |

注意：“完全一致”只表示当前文件字节一致，不自动证明两个平台运行时结果一致。例如随机数来源、触摸坐标和存储介质仍由平台环境决定。

## 7. 完整功能对照表

| 功能名称 | 微信版实现文件和函数 | Android 版实现文件和函数 | 微信版当前行为 | Android 版当前行为 | 差异类型 | 结论状态 | 推荐的统一目标 | 风险 |
|---|---|---|---|---|---|---|---|---|
| 启动 | `game.js`; `Main.constructor/start/loop` | `MainActivity.onCreate`; `index.html`; `game.js`; `Main.constructor/start/loop` | 初始化云能力并启动持续帧循环 | WebView 加载本地网页，使用按需帧循环 | 平台实现差异 | 代码确认 + 需要平台验证 | 保留各平台入口，共享游戏初始化协议 | 中 |
| 首页 | `Renderer.drawHome` | `Renderer.drawHome` | 标题、难度、最高分、开始、帮助、设置；布局较基础 | 相同功能，增加装饰线、最高分卡片、按钮高光和自适应布局 | 表现差异 | 代码确认 + 需要产品决策 | 以统一信息结构为准，吸收 Android 布局改进，分别验证安全区 | 低 |
| 帮助页 | `GameState.openHelp/closeHelp`; `Renderer.drawHelp` | 同名函数 | 规则说明和关闭入口 | 基本相同 | 规则/表现近似 | 需要平台验证 | 统一文案和滚动/适配规则 | 低 |
| 页面状态 | `GameState.setScreen`、`createUiState` | 同名函数 | `home/help/playing/gameover` 加设置、暂停、管理员、会员、复活弹层 | 状态集合相同 | 规则一致 | 代码确认 | 抽取共享状态机与转换测试 | 中 |
| 10x10 棋盘 | `Board.constructor/reset/canPlace/place` | 同名函数，文件哈希相同 | 10x10，越界或覆盖不可放置 | 相同 | 字节级一致 | 代码确认 | 直接共享纯规则模块 | 低 |
| 行列消除 | `Board.findCompletedLines/clearLines`; `GameState.finishPendingClear` | 同名函数 | 满行/满列同时识别，180ms 后清除 | 相同规则和时长 | 规则一致 | 代码确认 + 需要平台验证 | 共享规则与动画事件，平台绘制独立 | 中 |
| 放置计分 | `ScoreManager.getPlacementScore/applyPlacement` | 同名函数 | 每格 10 分；返回 `{placementScore}` | 每格 10 分；返回数值 | 返回接口差异 | 代码确认 | 统一为结构化结果对象 | 中 |
| 消除计分 | `getLineScore/getComboBonus/applyLineClear` | 同名函数 | `线数*100 + 线数²*50`，返回微信字段名 | 公式相同，返回 Android 字段名 | 返回接口差异 | 代码确认 | 统一字段：`lineScore/comboBonus/total` | 中 |
| 最高分 | `ScoreManager.syncBestScore`; `storage.saveBestScore` | 同名函数 | 实时按难度保存；管理员局不记录 | 相同 | 规则一致 | 代码确认 + 需要平台验证 | 共享资格规则和存档接口 | 高 |
| 新纪录反馈 | `GameState.checkNewRecord`; `Renderer.drawGameHeader` | 无对应反馈状态 | 超过开局最高分时显示新纪录提示 | 不显示 | 微信独有反馈 | 代码确认 | 两边统一保留，管理员局不显示 | 低 |
| 分数脉冲/消除得分文字 | `createScoreFeedbackState`; `showClearScoreFeedback`; `Renderer.drawGameHeader` | 无对应反馈状态 | 消除后分数缩放并显示消除线数与得分 | 不显示 | 微信独有反馈 | 代码确认 | 保留微信反馈，抽取表现状态和参数 | 低 |
| 方块库 | `Piece.js` 的 `SHAPE_LIBRARY` | 同路径同函数，文件哈希相同 | rescue/simple/medium/hard 形状与旋转变体 | 相同 | 字节级一致 | 代码确认 | 直接共享纯规则模块 | 低 |
| 三档难度 | `DIFFICULTY_RULES`; `createRack` | 同名常量/函数 | 简单、普通、大师的权重和限制 | 相同 | 字节级一致 | 代码确认 | 共享配置，并加固定随机源测试 | 高 |
| 候选组保底 | `createRack`、难度校验函数 | 同名函数 | 最多尝试 20 次，确保至少有一个可放置方块 | 相同 | 字节级一致 | 代码确认 | 共享生成器和失败结果协议 | 高 |
| 普通难度拥挤修正 | `getCategoryWeights` | 同名函数 | 棋盘填充达到阈值时增加救场块权重 | 相同 | 字节级一致 | 代码确认 | 共享并覆盖阈值测试 | 高 |
| 拖动定位 | `startDrag/moveDrag/getDraggedPieceVisualPosition` | `startDrag/moveDrag/updatePreviewStateFromVisual` | 偏移系数 1.5，范围 70-90；直接跟随 | 偏移系数 1.2，范围 48-72；保存指针、视觉尺寸和位置 | 行为/参数差异 | 代码确认 + 需要产品决策 | 真机手感测试后确定统一视觉目标，允许平台参数不同 | 中 |
| 拖动抬升动画 | 无独立抬升状态 | `dragStartTime/pickupAnim`; `Renderer.drawDraggedPiece` | 无 | 约 200ms 从候选槽抬升并轻微放大 | Android 独有反馈 | 代码确认 + 需要平台验证 | 两边保留同一反馈意图，坐标参数平台适配 | 低 |
| 拖动时候选槽 | `Renderer.drawRackPieces` | 同名函数 | 拖动过程中原槽方块仍可能绘制 | 主动隐藏正在拖动的原槽方块 | 表现差异 | 代码确认 | 采用 Android 行为，避免“双块”视觉 | 低 |
| 触摸结束坐标 | `InputManager.handleTouchEnd` | 同名函数 | 使用此前 move 后的预览位置 | 结束时读取 changedTouches 并再更新位置 | 输入健壮性差异 | 代码确认 + 需要平台验证 | 采用结束坐标二次同步，封装平台事件读取 | 中 |
| 刷新道具 | `GameState.useRefreshTool` | 同名函数 | 重新生成 3 块；失败不扣次数 | 相同 | 规则一致 | 代码确认 | 共享规则 | 中 |
| 清除道具 | `toggleClearTool/useClearTool`; `Board.clearArea` | 同名函数 | 清除点击中心附近 3x3 已填格；不计分、不触发行列奖励 | 相同 | 规则一致 | 代码确认 | 共享规则和事件 | 中 |
| 撤回道具 | `createUndoSnapshot/useUndoTool` | 同名函数 | 恢复最近成功放置前的棋盘、分数、候选块、动画和局内状态 | 相同核心字段 | 规则一致 | 代码确认 + 需要自动化测试 | 共享快照结构并版本化 | 高 |
| 道具次数 | `DIFFICULTY_TOOL_COUNTS`; `buildCurrentToolState` | 同名常量/函数 | 简单 3/1/1，普通 2/1/1，大师 1/0/1 | 相同 | 规则一致 | 代码确认 | 共享配置 | 高 |
| 连续消除反馈 | `comboState`; `handleLineClear`; Main 事件映射 | 同名状态和事件映射 | 3 秒窗口，触发 combo/combo3 音效和震动 | 相同 | 规则一致 | 代码确认 + 需要平台验证 | 共享事件规则，平台执行音频/震动 | 中 |
| 会员/福利码 | `submitMembershipCode`; `enableLocalMembership` | 同名函数 | 本地匹配，开启每局 2 次复活；微信键盘输入 | 相同规则；文案称“福利”，并有自绘键盘 | 文案/输入差异 | 代码确认 + 需要产品决策 | 统一产品命名和规则，输入层平台独立 | 中 |
| 复活 | `handleNoMoves/consumeRevive` | 同名函数 | 无路可走时询问；必要时随机清除最多 5 格后重抽 | 相同 | 规则一致 | 代码确认 + 需要自动化测试 | 共享规则和结果事件 | 高 |
| 管理员模式 | `submitAdminCode`; `AuthClient.verifyAdmin`; `enableAdminMode` | `submitAdminCode/enableAdminMode` | 输入经后端验证后开启 | 私测 APK 本地直接开启 | 平台实现/产品策略差异 | 代码确认 + 需要产品决策 | 私测 Android 可保留本地入口；正式产品按发布场景配置策略 | 中 |
| 管理员能力 | `buildCurrentToolState/getRoundReviveAllowance` | 同名函数 | 无限道具、无限复活、成绩不写正式最高分 | 相同 | 规则一致 | 代码确认 | 共享能力模型，授权来源平台化 | 高 |
| 设置项 | `storage.DEFAULT_SETTINGS`; `Renderer.drawSettings`; InputManager | 同名结构和函数 | 音效、背景音乐、曲目、震动、难度、最高分重置、会员和管理员状态 | 基本相同，部分文案和键盘不同 | 设置结构一致/表现差异 | 代码确认 + 需要平台验证 | 共享设置模型；平台控件和文案可适配 | 中 |
| 存档 | `storage.js` | 同文件哈希 | 微信同步 Storage | JSON 包装的 WebView localStorage | 逻辑一致/介质差异 | 代码确认 + 需要平台验证 | 共享序列化模型，平台存储适配器独立 | 高 |
| 音效 | `SoundManager`; Main 事件映射 | 同名类和事件映射 | 播放拾取、放置、消除、连击、点击、结束 | `playPickup()` 为空；其他主要音效保留 | 行为差异 | 代码确认 + 需要平台验证 | 恢复 Android 拾取反馈或明确用抬升动画替代 | 低 |
| 背景音乐 | `BGM_TRACKS`; `setBgmEnabled/setBgmTrack` | 同名函数 | 4 曲，可开关和切换 | 相同资源和曲目配置 | 规则/资源一致 | 代码确认 + 需要平台验证 | 共享曲目清单，音频实现平台独立 | 中 |
| 前后台音频 | `SoundManager.handleAppHide/Show`; `wx.onHide/onShow` | 同名函数；`MainActivity.onPause/onResume`; JS bridge | 隐藏时停止 BGM，显示时恢复 | 额外停止全部音效并暂停/恢复 WebView 与定时器 | Android 增强 | 代码确认 + 需要平台验证 | 采用“后台停止全部音频”的统一目标，生命周期适配独立 | 中 |
| 震动 | `Main.triggerVibration -> wx.vibrateShort` | shim `navigator.vibrate(20)` | 微信短震动 | WebView 调浏览器 vibration，实际支持取决于 WebView/设备 | 平台实现差异 | 需要平台验证 | 共享震动事件，平台适配器报告支持能力 | 中 |
| 渲染调度 | `Main.loop` | `Main.ensureFrame/requestImmediateRender/loop` | 持续 requestAnimationFrame | 脏标记 + 活跃动画时渲染 | Android 性能增强 | 代码确认 + 需要平台验证 | 共享“何时需要重绘”的状态，保留平台调度实现 | 中 |
| DPR/画布尺寸 | `js/render.js` | `render.js`; shim `syncCanvasSize` | 使用微信设备 DPR、安全区和菜单按钮 | DPR 上限 1.5，并限制总像素；无微信菜单按钮 | 平台实现差异 | 代码确认 + 需要平台验证 | 不直接共享完整实现；共享屏幕指标接口 | 中 |
| 暂停/返回首页 | `openPause/requestReturnHome/...` | 同名函数 | 继续、重开、确认返回首页 | 相同 | 规则一致 | 需要平台验证 | 共享状态转换，平台返回键单独设计 | 中 |
| Android 系统返回键 | 不适用 | `MainActivity.onBackPressed` | 无系统返回键 | WebView 有历史则后退，否则退出 Activity | Android 独有平台行为 | 代码确认 + 需要产品决策 | 决定是否先打开游戏暂停/退出确认 | 中 |
| 启动错误展示 | 微信开发者工具/运行时错误 | `index.html` 的 `bootError` | 无专用全屏启动错误层 | 捕获 error/unhandledrejection 并显示启动失败 | Android 独有诊断 | 代码确认 | 保留 Android；微信增加不泄露敏感信息的诊断策略 | 低 |

## 8. 核心规则专项审计

### 8.1 计分

对应文件：

- 微信：`js/game/ScoreManager.js`
- Android：`app/src/main/assets/js/game/ScoreManager.js`

对应函数和公式：

- `getPlacementScore(cellCount)`：`cellCount * 10`
- `getLineScore(lineCount)`：`lineCount * 100`
- `getComboBonus(lineCount)`：`lineCount * lineCount * 50`
- 消除总分：`lineScore + comboBonus`
- `syncBestScore(state)`：仅在 `state.bestScoreEligible` 为真且当前分数超过当前难度最高分时写入。

结果数值一致，但返回接口不一致：微信版使用 `placementScore/lineClearScore/bonusScore/clearTotalScore`，Android 版使用数值返回或 `lineScore/comboBonus/total`。这是未来共享接口必须先统一的地方。

### 8.2 方块生成

`Piece.js` 字节级相同，证据见第 6 节。关键函数：

- `expandVariants`：生成旋转变体并去重。
- `getCategoryWeights`：读取难度权重，并对普通难度拥挤棋盘进行救场权重调整。
- `createCandidateRack`：生成 3 个候选块。
- `easyRackValid/normalRackValid/masterRackValid`：限制候选组组成。
- `createRack`：最多尝试 20 次，并通过 `board.hasAnyValidMove` 保证至少存在一个合法落点。

三档类别权重：

- 简单：rescue 40、simple 35、medium 25、hard 0。
- 普通：rescue 35、simple 37、medium 20、hard 8。
- 大师：rescue 20、simple 25、medium 30、hard 25。

随机过程依赖 `Math.random()`。代码一致不代表两平台会生成同一序列；若要自动比较，需要注入可固定种子的随机源。

### 8.3 消除

`Board.js` 字节级相同。`findCompletedLines` 分别扫描所有行和列；`clearLines` 以行列集合一次清除交叉区域。`GameState` 在放置后建立 `pendingClear`，等待 `CLEAR_ANIMATION_MS = 180` 后执行实际清除和计分。

微信版额外把计分结果写入 `scoreFeedback`；Android 版只更新分数。这不改变数值，但改变玩家看到的反馈。

### 8.4 道具

- 刷新：调用同一个 `createRack`；失败不扣次数、不替换原候选组。
- 清除：调用 `Board.clearArea(row, col, 1)`，即最多 3x3；不加分、不触发行列消除奖励。
- 撤回：恢复最近成功放置前快照。快照包含棋盘、分数、候选块、待消除状态、动画、难度、道具使用量、复活量、最高分资格和 combo 状态。

撤回属于高价值自动化测试对象，因为字段较多，未来任一版本新增状态时容易漏入快照。

### 8.5 设置与存档

`storage.js` 字节级相同，但底层存储介质不同。

**设置键与字段：**

- 存储键：`block_puzzle_settings_v1`
- `soundEnabled`：默认 `true`
- `bgmEnabled`：默认 `false`
- `vibrationEnabled`：默认 `true`
- `bgmTrack`：默认 `2`
- `difficulty`：默认 `normal`
- `localMembershipEnabled`：默认 `false`

**最高分结构：**

```text
easy: 0
normal: 0
master: 0
```

- 新最高分键：`block_puzzle_best_scores_v1`
- 旧单一最高分键：`block_puzzle_best_score_v1`

**兼容行为：**

- `loadSettings` 以默认设置为底，再覆盖已保存字段，因此旧存档缺失新字段时会自动补默认值。
- `normalizeDifficulty` 只接受 `easy/normal/master`，无效值回退到 `normal`。
- `sanitizeBestScores` 对缺失或非数值最高分回退到 0。
- 若新最高分对象不存在，`loadBestScores` 读取旧单值最高分，并迁移到 `normal`。
- 微信 Storage 读取异常会被捕获并回退默认值。

**JSON 解析失败：**

- 微信版 `storage.js` 直接接收微信 Storage 已还原的值，不自行解析 JSON；读取异常由 `try/catch` 回退。
- Android shim 的 `safeParseStorage` 对 `localStorage.getItem` 结果执行 `JSON.parse`；解析失败时返回原始字符串。
- 若 Android 设置值解析失败成为字符串，`loadSettings` 会因其不是对象而回退默认设置。
- 若 Android 最高分 JSON 解析失败成为字符串，`loadBestScores` 不把它视为有效对象，之后尝试旧键迁移并写回默认/迁移结果。

**介质差异：**

- 微信版数据位于微信小游戏本地 Storage，其清理、账号隔离和容量规则由微信平台决定。
- Android 数据位于应用 WebView 域 `appassets.androidplatform.net` 对应的 `localStorage`，卸载应用、清除应用数据、WebView 数据策略变化可能使其消失。
- 两边使用相同键名和对象结构，不表示数据会自动跨平台同步。

### 8.6 音效和动画反馈

两边 Main 都消费 `pickup/place/invalid/clear/combo/combo3/gameOver` 事件。差异在执行层：

- Android `SoundManager.playPickup()` 当前直接返回，因此虽然 `pickup.mp3` 存在且字节一致，运行时不播放。
- 微信版在消除后额外显示得分反馈和新纪录反馈。
- Android 版拖动有抬升、缩放和隐藏候选槽原块的动画。
- Android 后台处理停止全部音效；微信只停止 BGM。

建议共享事件名称、表现状态和动画参数定义，但不要把音频对象或 Canvas 调度直接放入纯规则核心。

## 9. 资源差异与可复核证据

### 9.1 两边当前运行时音频完全一致

路径前缀：

- 微信：`we xin xiao cheng xu/audio/`
- Android：`we xin xiao cheng xu-android-apk/app/src/main/assets/audio/`

| 文件 | 两边大小（字节） | SHA-256 | 当前引用 |
|---|---:|---|---|
| `bgm_1.mp3` | 7,002,412 | `0A36DE0F9858C2AD7BFBCA5D278421A3FDE7BC2F7D6DA63803E5E2ECF12843A5` | 两边 BGM 轨道 1 |
| `bgm_2.mp3` | 6,031,852 | `A02A78C22AC130806AFA5C66A90E042586FDE2F288BBEE8114719C0C331F8D11` | 两边 BGM 轨道 2 |
| `bgm_3.mp3` | 7,267,372 | `BFC7EB6F96E0E09F2A050D5FF6CA464DC8A1705AAC0A8B95F9D2212E339B21B4` | 两边 BGM 轨道 3 |
| `bgm_4.mp3` | 6,371,692 | `9774A7966291A1B6433774A19B179CEF639D6851BD79676C95C23FA0DEB44D7B` | 两边 BGM 轨道 4 |
| `clear.mp3` | 34,732 | `918F06A8263B4FBD9F60D457D47A9D1D3B14AC2372C3A208169CE18E81DF049E` | 两边消除 |
| `click.mp3` | 10,732 | `637CE219B25AA178FEBBFC979F4DA83F153B4B25E1379FC3DE10BF1ABC92AC98` | 两边点击/无效操作 |
| `combo.mp3` | 42,412 | `D9A0FDD62681528A9BE033EC6C9C8D87B743D3122DA9CD66A6BBAD3699AA61B1` | 两边连击 |
| `combo3.mp3` | 44,332 | `8EA535A7FF4C83073025C050F5F35817521A4BD6A3BF629D09F6550E2AA0BC09` | 两边高连击 |
| `gameover.mp3` | 112,849 | `54397506EE392B91941537981238624D27B5EA98D3A437097A825110FF5E2FA7` | 两边游戏结束 |
| `pickup.mp3` | 8,812 | `6830F3B0D20B65DB844E39659B3B5490FA87DDE52DD0512BD8B975F7F5203787` | 微信实际播放；Android 文件存在但函数禁用 |
| `place.mp3` | 8,812 | `F8E1F0DFF36EA254DCDB633747906D200A13692C69B7B224FFBC7864359FFD6F` | 两边放置 |

“资源一致”表示文件大小和哈希相同；`pickup.mp3` 证明了资源相同不等于行为相同。

### 9.2 微信版旧音频清理结果

`audio/bgm_template_old.mp3`、`audio/boom.mp3` 和 `audio/bullet.mp3` 已确认不在 SoundManager、资源映射、配置、测试或动态路径中引用，并于 2026-07-16 从微信发布目录移除。当前资源验证会拒绝未映射音频重新进入三端发布目录。

### 9.3 Android 图片资源

| 路径 | 大小（字节） | SHA-256 | 判断 |
|---|---:|---|---|
| `app/src/main/res/drawable/app_icon.png` | 1,386,965 | `5355FCD7807465B8CBAE66A470345924761E521D071294A20D78C32481B04DB2` | Manifest 正式引用的应用图标 |
| `ChatGPT Image 2026年5月22日 18_46_41.png` | 1,386,965 | `5355FCD7807465B8CBAE66A470345924761E521D071294A20D78C32481B04DB2` | 与应用图标字节相同，但根目录副本未被运行时引用 |
| `2fd25165497bdc6c6dd73d9826e75ad8.png` | 133,953 | `C7F30D096969A6BCA735080B89F26B4913801B9B1C14F07C0F14744A894A9B9D` | 未被正式调用链引用；当前为未跟踪用户文件 |

两个项目都没有发现 `.ttf/.otf/.woff/.woff2` 独立字体文件。Canvas 使用系统 `sans-serif`，实际字形由平台字体决定，需真机检查中文显示和字宽。

## 10. 微信版独有优点

1. **正式微信平台身份链**：`AuthClient` 支持微信登录、后端健康检查、CloudBase 容器请求和请求回退。
2. **服务端管理员验证**：管理员输入不会仅靠本地常量决定，适合未来上线、审核或正式运营场景。
3. **更完整的得分反馈**：消除得分提示、分数脉冲、新纪录提示提升了玩家对奖励的感知。
4. **拾取音效启用**：拖起方块时有独立声音反馈。
5. **微信安全区信息**：直接读取微信菜单按钮和安全区域，适应小游戏顶部系统 UI。

## 11. Android 版独有优点

1. **拖动反馈更完整**：抬升、放大、隐藏候选槽原块，并在 touchend 再同步最终坐标。
2. **渲染性能控制**：DPR 限制、画布总像素限制、脏标记和按需帧调度，减少 WebView 持续重绘。
3. **生命周期处理更完整**：Kotlin 与 JavaScript 双层处理前后台，暂停 WebView 定时器并停止全部音效。
4. **离线独立运行**：不依赖微信登录或后端即可运行核心游戏。
5. **启动错误界面**：网页启动异常会显示可读错误，而不是只留空白画布。
6. **福利码输入适配**：增加自绘键盘，避免部分 Android WebView 软键盘点击问题。
7. **首页视觉优化**：布局更紧凑、最高分层级更明确、按钮高光更完整。

## 12. 平台 API 与通用业务代码边界

### 12.1 可抽取为共享核心

- 棋盘数据和合法放置：`Board`
- 方块定义、旋转、难度权重和候选组生成：`Piece`
- 计分公式和最高分资格判断
- 道具规则和使用次数
- 复活规则
- 页面/弹层状态转换
- 设置和最高分的数据结构、默认值、兼容和迁移规则
- 领域事件：`pickup/place/invalid/clear/combo/combo3/gameOver`

### 12.2 可以共享的 presentation 定义

presentation 指“玩家看到和感受到的表现层”，但本报告只建议共享定义，不断言可直接共享完整 `Renderer`。

可以共享：

- 反馈事件名称和载荷，例如消除线数、得分增量、新纪录。
- 动画时长、缩放幅度、颜色等平台无关参数。
- 表现状态，例如拖动抬升进度、分数脉冲剩余时间、提示消息。
- 布局语义和常量，例如顶部区域、棋盘区域、候选区、按钮间距。

### 12.3 必须保留平台实现

- Canvas 创建和实际绘制上下文。
- DPR、画布像素上限和缩放策略。
- 微信安全区、菜单按钮与 Android 刘海/系统栏适配。
- requestAnimationFrame 调度、脏重绘和 WebView 定时器管理。
- 微信 `onHide/onShow` 与 Android Activity 生命周期。
- 音频对象、震动、键盘和存储介质。
- 微信登录、CloudBase/网络请求和 Android 离线策略。

### 12.4 建议平台接口

```text
StoragePort       load(key), save(key, value)
AudioPort         playEffect(id), playBgm(id), stopAll(), suspend(), resume()
HapticsPort       vibrate(kind), isSupported()
LifecyclePort     onForeground(handler), onBackground(handler)
InputPort         touch events, text input, system back
ScreenPort        width, height, DPR, safe insets, menu/system obstructions
AuthPort          login(), verifyAdmin(), capability flags
RenderScheduler   invalidate(), requestAnimation(), suspend(), resume()
```

## 13. 每项差异的推荐保留方向

| 差异 | 推荐 | 原因 |
|---|---|---|
| 棋盘和生成规则 | 保留当前共同实现 | 已字节级一致，是最稳定共享基础 |
| 计分公式 | 保留当前共同数值 | 两边结果一致，避免破坏历史最高分可比性 |
| 计分返回对象 | 采用统一结构化对象 | 便于反馈、测试和未来扩展 |
| 微信得分反馈 | 两边保留 | 信息明确，Android 缺失不代表应删除 |
| Android 拖动动画 | 两边保留反馈意图 | 改善遮挡和双块问题；参数可平台化 |
| Android 按需渲染 | 保留在 Android 平台层 | 对 WebView 性能有明确价值，不必强迫微信采用同一调度 |
| Android 后台停止全部音效 | 两边统一目标 | 避免切后台后残留短音效 |
| 微信拾取音效 | 默认两边启用 | 资源已存在；若与抬升动画冲突可作为产品设置 |
| Android 自绘福利键盘 | Android 保留 | 解决 WebView 输入兼容；微信继续用平台键盘 |
| 微信服务端管理员验证 | 微信正式场景保留 | 适合上线和运营标准 |
| Android 本地管理员入口 | 私测 APK 可保留 | 符合当前私下测试用途，但需明确构建/发布策略 |
| 首页布局 | 以 Android 视觉层级为候选 | 更完整，但必须经过微信安全区和小屏验证 |
| 完整 Renderer | 暂不直接合并 | 两边已有 DPR、绘制和调度差异，证据不足以支持直接共用 |

## 14. Android 管理员模式场景说明

当前 Android APK 属于私下传播和测试用途，不涉及正式上架、公开运营或服务端权限控制。因此：

- Android 当前允许在本地开启管理员模式。
- 该行为与微信版的服务端验证不同，归类为**平台实现差异/产品策略差异**。
- 它不是阻断共享棋盘、计分、道具等代码融合的高危问题。
- 若 Android 将来公开发布、接入排行榜、付费、账号、运营活动或远程数据，则必须重新评估本地管理员入口。
- 微信小程序若涉及上线、审核或正式运营，应按正式产品标准评估权限控制、后端验证、日志和成绩资格。
- 本报告不记录任何真实会员码、验证码、管理员凭据、AppID、密钥、环境标识或其他敏感值。

建议未来将“管理员能力”和“管理员授权来源”分开：共享核心只接收能力状态；微信由后端适配器提供，Android 私测构建可由本地测试适配器提供。

## 15. 推荐统一架构

```text
shared/
  core/
    board
    pieces
    scoring
    tools
    revive
    game-state
  data/
    settings-schema
    save-schema
    migrations
  presentation-model/
    feedback-events
    animation-state
    layout-semantics

platform-wechat/
  bootstrap
  canvas-renderer
  render-scheduler
  wx-storage
  wx-audio
  wx-haptics
  wx-keyboard
  wx-auth-backend
  wx-screen-safe-area

platform-android/
  MainActivity/WebView
  browser-wx compatibility or replacement adapter
  canvas-renderer
  render-scheduler
  localStorage
  HTML audio
  Android/WebView lifecycle
  keyboard
  local-test auth policy
  Android screen metrics
```

短期最简单的路线不是立即重组两个仓库，而是先让共享核心成为可复制构建产物或单一源目录，再逐步减少平台副本。直接一次性合并 `Renderer` 风险较高，不推荐作为第一阶段。

## 16. 分阶段迁移计划

### 阶段 0：冻结基线

- 保存本报告中的哈希和规则快照。
- 建立固定随机源、棋盘夹具和预期结果。
- 明确会员/福利命名、拾取音效、拖动参数、管理员发布策略。

### 阶段 1：规则测试

- 为 Board、Piece、ScoreManager、道具、复活和存档迁移建立不依赖 Canvas 的自动化测试。
- 先对两份现有实现运行同一批测试，证明基线行为。

### 阶段 2：共享纯核心

- 抽取已经一致的 `Board`、`Piece`、`storage schema`。
- 统一 ScoreManager 返回对象。
- 把平台存储调用替换为注入的 `StoragePort`。

### 阶段 3：统一状态和反馈事件

- 统一页面状态、撤回快照、复活和管理员能力模型。
- 将得分反馈、拖动反馈定义为共享事件/表现状态。
- 两个平台 Renderer 各自消费相同表现状态。

### 阶段 4：平台适配

- 微信保留真实 `wx` API、登录、后端和安全区。
- Android 保留 WebView 生命周期、DPR 限制、按需渲染和输入兼容。
- 用能力检测代替核心代码中的平台判断。

### 阶段 5：视觉和资源统一

- 统一首页信息层级、设置文案、音效触发和动画参数。
- 建立资源清单和哈希检查，防止两边资源再次漂移。

### 阶段 6：发布前双平台回归

- 微信开发者工具、微信真机、Android 模拟器和至少两类 Android 真机全部通过清单。
- 检查存档升级、后台恢复、音频和管理员成绩资格。

## 17. 风险与验证方法

| 风险 | 说明 | 验证方法 |
|---|---|---|
| 随机结果不可重现 | 两边都使用 `Math.random()` | 注入固定随机源，比较候选组序列和概率统计 |
| 撤回漏状态 | 快照字段多 | 对放置、消除前后、复活后、道具后逐字段断言 |
| 存档看似同构但介质不同 | localStorage 与微信 Storage 生命周期不同 | 重启、升级、清数据、异常 JSON、旧键迁移测试 |
| 管理员成绩污染 | 授权来源不同 | 测试开启/关闭管理员前后最高分资格 |
| Renderer 强行合并 | DPR、安全区和调度不同 | 保持双实现，用截图基准和语义布局测试 |
| 音频前后台残留 | 平台音频对象行为不同 | 播放各音效后立即切后台/锁屏/恢复 |
| 触摸坐标偏差 | WebView、微信和真机坐标差异 | 小块、大块、屏幕边缘、快速拖放、touchcancel |
| 字体差异 | 使用系统 sans-serif | 检查中文截断、数字宽度、按钮溢出 |
| 中文路径构建限制 | 当前 Gradle 被路径检查阻止 | 在纯英文临时路径执行完整构建；不修改业务文件 |

## 18. 当前验证结果

- **JavaScript 静态语法检查通过**：微信版检查了 25 个 JavaScript 文件；Android 版检查了 13 个 JavaScript 文件。
- **尚未证明运行时行为一致**：静态语法、源代码和哈希不能替代实际运行。
- **Android 构建因 Windows 中文路径检查被阻止，未进入完整编译**：Android Gradle Plugin 在应用插件阶段检测到非 ASCII 路径并终止。
- **微信开发者工具、Android 模拟器和真机仍未验证**。

## 19. 未解决问题清单

1. Android 版 `createEmptyDragState` 的静态片段与后续动态添加的抬升字段之间是否在所有触摸路径均稳定，需要运行确认。
2. Android 同时存在自绘福利键盘和隐藏 HTML 输入框，最终应保留双通道还是只保留一种。
3. Android 系统返回键应退出应用、返回首页，还是先打开暂停确认。
4. 微信持续帧循环是否需要引入按需渲染，尚无性能数据支持。
5. Android DPR 1.5 上限是否适合所有高分辨率设备。
6. 微信版得分反馈在小屏和菜单按钮安全区下是否遮挡。
7. Android 拾取音效禁用是有意设计，还是为避免与动画重复而临时关闭。
8. 仓库根目录图片的发布用途尚不明确，但不影响当前游戏运行。

## 20. 产品决策清单

1. 统一称为“会员”还是“福利”，以及该能力是否长期保留为本地功能。
2. 两个平台是否都启用拾取音效。
3. 拖动视觉目标：偏移距离、抬升时长、缩放幅度是否统一，还是按平台调参。
4. 首页最终采用哪套视觉层级和文案。
5. Android 私测管理员入口在未来公开版本中的处理：移除、构建开关或接入服务端。
6. 管理员面板是否应该在默认用户界面中可见。
7. 微信版是否采用 Android 的后台停止全部音效策略。
8. Android 系统返回键的产品行为。

## 21. 平台人工验证清单

### 微信开发者工具与微信真机

- 启动、首页、帮助、设置、暂停、返回首页、重开和结束流程。
- 三档难度切换及“下一局生效”提示。
- 拖动偏移、边缘放置、无效放置、touchcancel。
- 行列同时消除、分数脉冲、消除得分和新纪录提示。
- 4 首 BGM、全部音效、静音、震动、切后台和恢复。
- 菜单按钮、安全区、高 DPR 和不同屏幕尺寸。
- 登录成功、登录失败、后端不可用时本地游戏继续运行。
- 管理员验证、管理员成绩不写最高分。
- 会员输入和每局复活次数。

### Android 模拟器与真机

- APK 启动、启动错误页和中文字体。
- 拖动抬升、候选槽隐藏、快速拖放和手指遮挡。
- DPR 限制下画面清晰度、动画流畅度和内存。
- 按需渲染是否遗漏提示消失、消除动画或设置变化。
- 自绘福利键盘、隐藏 HTML 输入框、软键盘弹出与关闭。
- 系统返回键、Home、最近任务、锁屏、旋转锁定和恢复。
- 所有音效、BGM、震动及后台无残留声音。
- 清除应用数据、升级安装和卸载重装后的存档行为。
- 本地管理员模式及成绩资格。

## 22. 推荐的第一批自动化行为测试

1. `Board.canPlace`：越界、重叠、四角和不同尺寸方块。
2. `Board.findCompletedLines/clearLines`：单行、单列、交叉、多行多列。
3. 计分：1-5 格放置；1-4 线消除；总分公式。
4. 最高分：按难度隔离、管理员局排除、重置单一难度。
5. 方块生成：每档允许类别、候选组限制、普通难度连续蛇形限制。
6. 保底：无合法组时最多 20 次失败；存在合法组时返回 success。
7. 刷新：成功扣次数；失败不扣次数且保留旧候选组。
8. 清除：3x3 边界裁剪、不计分、不触发行列奖励。
9. 撤回：放置和消除前后完整状态恢复，且不回滚历史最高分。
10. 复活：无路可走、有/无复活次数、随机清 5 格后的重抽。
11. 存档：缺失字段、无效难度、非数值最高分、损坏 JSON、旧单值迁移。
12. 页面状态：首页到游戏、暂停、设置、复活、结束之间的合法转换。
13. 领域事件：相同动作产生相同事件和载荷，不直接依赖平台 API。

## 23. 后续迁移前的阻断条件

以下条件未满足前，不应开始删除重复代码或让某一版本覆盖另一版本：

1. 产品决策清单中的管理员策略、会员/福利命名、拖动目标和拾取音效已明确。
2. 第一批 Board、Piece、Score、存档、道具、撤回和复活测试可以在两份现有实现上运行。
3. Android 在纯英文路径完成一次完整 Gradle 构建。
4. 微信开发者工具至少完成一次完整主流程验证。
5. 两个平台各完成至少一次真机触摸、音频、前后台和存档验证。
6. 共享接口明确区分核心规则、表现状态和平台能力。
7. 已决定现有存档键继续兼容，且迁移测试覆盖旧最高分键。
8. 已建立资源清单或哈希检查，避免迁移后音频丢失。
9. 已确认不把真实会员码、验证码、AppID、密钥或后端凭据移入共享或文档代码。
10. 已确认完整 Renderer 不作为第一批直接合并对象。
