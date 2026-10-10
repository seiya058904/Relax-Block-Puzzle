# Relax Block Puzzle — 独立跨平台审计

审计角色：Cross-Platform Auditor。参考基线：上传的 `relax-block-puzzle-cloud-handoff-20261009-4d1c308.zip` 及主审计在解压前生成的逐文件 SHA-256 清单。审查日期：2026-10-10。本文是源码边界和适配器专项结论；最终运行门禁、修复级别与整体交付状态以主审计报告为准。

## 结论

本次独立检查没有发现可复现的新 P0/P1/P2 平台启动阻断，也没有发现共享源权威性、Android 工具链或平台资源边界被本轮修复破坏。此结论只覆盖已执行的源码、文件哈希和静态导入检查，不等同于 Android APK、微信开发者工具或真机验收。

本轮不应把平台层强制合并：微信入口、云鉴权、同步 Storage、轻量音频、系统键盘和菜单按钮安全区仍有明确平台语义；Web 与 Android 仍保留各自 HTML 和触控承载层。

## 1. 方法与证据

独立阅读根及两个平台的 `AGENTS.md`、`docs/UNIFIED_SPEC.md`、`docs/PLATFORM_SYNC.md`、`config/platform-manifest.json`、共享源、三端启动链，以及 Android Kotlin、Manifest、Gradle、布局文件。通过原 ZIP 文件清单逐一比较现有源码，未仅依赖主代理对修改范围的口头描述。

可重复运行的只读检查位于 `inspect-boundaries.py`。它接受项目目录、原始文件哈希清单、输出目录，以及可选原始 ZIP；需要先按交接说明恢复 Android 音频镜像。结果分别写入 `inventory-check.json` 与 `entry-config-check.json`。`current-diff.patch` 仅将两侧换行归一后展示语义差异；SHA-256 比较仍按真实字节进行。

当前检查快照如下，最终打包前若文件数量变化应重新运行该脚本：

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 原 ZIP 226 个文件保全 | 全部仍存在，缺失 0 | `inventory-check.json: missing` |
| 共享声明覆盖 | 11 个共享模块 | `config/platform-manifest.json` |
| 生成副本比对 | 11 × 3 = 33 个均为生成标记加权威源，漂移 0 | `inventory-check.json: generatedDrift` |
| 共享修改范围 | 仅 `ScoreManager.js` 与 `utils/storage.js`；Board、Piece、DragModel、常量及概率配置未改 | 原始与当前 SHA-256 |
| 工具链、入口、配置与服务端保全 | 41 个关键文件按原字节保持 | `entry-config-check.json: protectedHashesUnchanged` |
| 静态相对导入 | 124 条可解析，未解析 0 | `entry-config-check.json` |

静态导入检查覆盖字面量 ESM 相对导入及再导出，不能代替平台编译器执行。唯一既有的无扩展名入口导入是微信 `game.js` 中的 `./js/api/AuthClient` 与 `./js/main`；本轮没有改变它们。Web/Android 使用带 `.js` 的 ESM 入口。

## 2. 共享源码边界

`scripts/platform-inventory.mjs` 检查 `shared/js` 实际文件与 `shared`、`generated` 声明一致，拒绝目录越界、大小写冲突、孤立生成副本及共享/平台分类冲突。`scripts/sync-platforms.mjs` 与 `scripts/verify-platforms.mjs` 没有被修改。独立逐字比对确认 33 个生成副本与权威源一致；没有为了通过一致性门禁删减声明或放宽生成内容检查。

本轮共享变更仍位于合理边界：

- `ScoreManager` 的修改涉及正式成绩资格、游戏 generation 和异步保存完成后的状态协调；计分公式仍使用原常量。
- `storage.js` 将既有可信读取函数导出供状态层协调使用；Web Locks/IndexedDB 协调过程及原键、清洗和迁移实现没有被替换为无锁写入。
- 平台特有的 `GameState`、`InputManager`、`Renderer`、`SoundManager`、`main.js` 和 browser shim 仍作为独立适配层。微信云服务 API 未被搬入共享源。

独立检查证明当前生成物一致；它不能仅凭字节结果证明编辑过程中调用了哪个命令。主代理的 `npm run sync` 和现有 `npm run verify` 日志负责提供同步过程与门禁记录。

另逐项对比了两个被调整的既有测试：`game-state.test.mjs` 只为 Combo 用例补上“先进入游戏”的前置状态，原反馈数值断言未变；`web-audio-stability.test.mjs` 将过宽的“禁止任何 blur 监听器”源码正则约束交由新增真实 shim 事件用例检查，后者要求 blur 只能取消输入、不能触发 hide/show 或音频生命周期。本次没有看到棋盘、分数、难度或生成一致性断言被放宽以掩盖失败。

## 3. 平台入口与生命周期

### Web

浏览器 `docs/index.html` 先导入本平台 shim，再导入 `game.js` 并创建一个 `Main`。Web 的透明 `inputLayer` 仍作为触控承载层，Canvas、隐藏的 HTML 键盘输入和 boot-error 显示层仍保留。`docs/` 的图标和页面 CSS 没有被 Android 版本覆盖。

Web/Android shim 的 `withStorageLock` 仍优先使用 Web Locks；不可用时使用 IndexedDB `readwrite` 事务作为协调锁，将 localStorage 的同步读、合并、写置于取得锁后的回调中。无法协调时拒绝，而不是转入无锁覆盖。此处是跨页串行协调，不应在报告中写成“localStorage 与 IndexedDB 构成原子跨数据库事务”。

本轮新增 `blur` 处理只取消鼠标输入拥有权；真实隐藏/显示仍由 `visibilitychange`、`pagehide`、`pageshow` 转发并去重。没有把窗口失焦等同于应用后台来重启 BGM。

### Android WebView

`app/src/main/java/com/blockpuzzle/android/MainActivity.kt` 与输入基线完全相同。WebView 仍通过 `WebViewAssetLoader` 的 `/assets/` 处理器加载 `https://appassets.androidplatform.net/assets/index.html`，开启 JavaScript 和 DOM Storage，关闭 file/content 直接访问。当前本地游戏入口及其 JS、HTML 文件均可解析；没有新增对公网启动依赖的路径。

Activity 的既有生命周期顺序保持：`onPause` 向 JS 发送后台通知，再调用 WebView 的暂停；`onStop` 按进程级 `timersPaused` 标记暂停定时器；`onResume` 恢复 WebView/定时器并向 JS 发送前台通知。JS 层仍保留重复通知去重和当前帧调度拥有者。原有返回键策略也未改变。

以下版本和配置按原字节保持：AGP 8.5.2、Gradle Wrapper 8.7、Kotlin 1.9.24、JDK/JVM 17 目标、compile/target SDK 34、min SDK 26、Android `versionCode = 12` / `versionName = 1.0.12`。Manifest 的 portrait 方向、权限、Activity 导出配置，构建类型与签名相关配置均未修改。没有生成或发布 APK/AAB。

没有 Android SDK/模拟器/真机证据时，不能从 Kotlin 源码调用顺序推断真实 WebView 的异步 JS 回调时机、声音停播时机或后台后内存回收已验收。源码没有显式 `onDestroy` WebView 清理，但本轮没有建立原生资源滞留或实例泄漏的复现，因此不将“缺少 destroy 字样”单独判为产品 Bug。

### 微信小游戏

微信仍由 `game.js` 初始化 Cloud 后创建 `Main`；`AuthClient.initCloud()` 保留幂等保护和初始化失败返回值。`Main` 在异步健康检查与登录完成前即完成 Canvas、输入及游戏首页初始化，健康检查/登录异常由各自 catch 处理；代码层没有新增“后端失败则普通本地游戏不能启动”的阻断。

`game.json` 仍配置 portrait；`project.config.json` 的游戏编译类型及其原设置未改。微信 `render.js` 继续读取 wx 窗口指标、原生安全区与菜单按钮，并选择轻量画布质量配置。`wx.onHide/onShow/onWindowResize` 仍是生命周期与窗口来源。新增管理员请求 generation 校验没有替换原服务端验证来源或修改后端/生产配置。

浏览器里的微信宿主、Node 的 wx mock 只能验证调用合同和 JS 状态；不能等同于微信开发者工具编译、基础库兼容、包体上传、CloudBase 连通性或真实设备表现。

## 4. 资源完整性与平台差异

| 平台 | 音频文件数 | 实际字节 | 本轮内容变化 |
| --- | ---: | ---: | --- |
| 微信 | 11 | 2,931,409 | 原音频逐字节未改 |
| Web | 11 | 26,936,009 | 原音频逐字节未改 |
| Android | 11 | 26,936,009 | 由 Web 保留音频恢复的完整镜像 |

Web 与 Android 的文件相对路径及每个 SHA-256 完全一致；微信继续使用自己的轻量编码。资源映射与预算配置没有变化，`syncAudio` 仍为 `false`。最终 ZIP 允许省略 Android 的 26,936,009 字节镜像，但必须保留 Web 音频和可重复执行的完整恢复流程，并在 fresh-extract 恢复后再运行资源门禁。

本轮在微信 SoundManager 中补齐隐藏时停止效果音、拒绝后台新音效；三端静音设置停止当前效果音。效果音仍按逻辑键缓存，BGM 切换仍停止/销毁旧上下文。Web/Android 既有 `playPickup()` no-op、微信拾取播放和不同音频质量仍保持，未借本次修复扩大声音行为统一范围。真实听感、系统音频焦点和长时原生内存仍属于设备验收。

## 5. 新防护的设备验收界限

本轮短视口防护会在布局判定不可用时暂停游戏推进、取消拖拽、清空 Canvas 命中区域，并显示“请转为竖屏或增大窗口”；恢复可用视口后恢复原页面/局面。它是失效布局保护，不承诺在任意横向短窗口完整呈现游戏。

交叉质疑路径为：福利/会员面板打开，HTML 输入已聚焦，软键盘或窗口尺寸变化把可用高度压到 560 以下。输入审计代理的真实 Chromium 检查已覆盖聚焦输入后缩到 `568×320`、继续输入、再恢复尺寸：输入状态、面板及恢复后的 Canvas 文本保留，错误为 0（`input/browser/fixed-keyboard-resize/report.json`）。这支持“数据与输入会话未丢失”，不能证明 Android 系统 IME 或微信原生键盘在短视口中的可见布局已验收。

因此保留以下待设备验收项目，不把它们计为已证实缺陷或已通过项：

- Android 系统键盘显示/隐藏、系统栏变化、锁屏和 Activity 重建时的 Canvas 与输入恢复。
- 微信原生键盘、菜单按钮安全区、后台返回、音频停止与恢复。
- Android/WebView 真实 IndexedDB 与本地 origin 持久性、系统回收后启动；本轮浏览器与 JS 测试不能代替安装升级与设备检查。

## 6. 文档与交付核对

独立初审确认一个 P3 文档过时项：`docs/PLATFORM_SYNC.md` 把早期“根目录不是 Git、只有 Android 子目录是独立 Git”的目录历史当作当前关系，并在共享文件列表漏列 `Presentation.js`。权威 manifest 实际已包含该模块。本项影响交接人员定位权威源与 Git 边界，没有运行时玩家影响。主代理已按当前统一仓库与 ZIP 的区别更正文字、补全共享文件列表，并明确单独恢复 Android 音频；独立对比确认同步器未变。置信度高。

另有两个打包约束需要主代理最终处理，不能将原交接状态直接沿用：

- `MANIFEST-SHA256.txt` 是基线 225 个文件的 hash/byte 清单。本轮变更后应重新生成当前文件清单，或明确归档基线清单并新增当前清单，避免交付自相矛盾。
- `CLOUD-HANDOFF.md` 中的 239/242、219/222 以及此前 `spawnSync EBUSY` 是原交接/环境记录。恢复音频后的当前门禁结果应独立列出；不能机械地计作五个产品缺陷。

本专项未进行产品源码修改、共享副本同步、提交、推送、PR/Issue 创建、部署、发布、原生构建或签名操作。最终文件数量、报告和包内恢复结果由主代理完成打包后重新核对。
