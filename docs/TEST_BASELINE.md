# 三端验证基线与验收边界

更新：2026-10-04。范围：候选 `057b8f8` 的 `v1.0.12` 正式封板；不改变 10×10、计分、生成、道具、撤回、复活、最高分资格或存档格式。本轮只处理发布元数据、文档和有实际失败证据的 APK 回归等待竞态。

本文记录当前覆盖和证据类型。历史的 136 / 184 / 213 项计数不再作为当前基线；旧轮次记录可从 Git 历史查看。产品界面统一使用“福利”，代码中的 `localMembershipEnabled` 等历史字段保留以兼容存档。

## 1. 证据类型

| 验证层 | 实际运行内容 | 能证明什么 | 不能代替什么 |
| --- | --- | --- | --- |
| Node 自动化 | `node:test` 导入生产模块；内存 Storage、平台回调、Canvas、音频、RAF 等按测试需要 mock | 规则、状态转换、事件次数、布局数学、生命周期调度、共享模块一致性 | 浏览器像素、原生 API、真实音效/震动或设备性能 |
| Web Chromium 自动化 | 本地 Web 入口、真实 Canvas、鼠标/CDP 触摸；最高分用两个真实页面和 localStorage | 指定视口的画面/输入结果、重绘像素、缓存预算、浏览器存储回归 | 其他浏览器、物理触屏手感、手机 GPU 帧率 |
| 微信 Chromium host | 微信平台 Main/Renderer/InputManager 在 Chromium 中配合浏览器 `wx` shim 运行；认证初始化在夹具中关闭 | 微信平台代码的输入/表现回归和 Canvas 输出 | 微信原生运行时、原生 Storage/音频/震动、开发者工具或真机验收 |
| 已安装 Android APK 自动化 | 构建后的 debug APK 安装到独立 Android QA 目标；实际 Activity、打包 WebView 和资源 | APK 输入流程、宿主后台恢复、进程重启后的本地存储、资源身份 | 仅构建成功不能证明交互；模拟器通过不能记作物理手机通过 |
| 微信人工验收 | 用户在微信开发者工具中手动编译、观察并操作 | 只记录人工实际确认的项目 | 不扩展成未操作过的流程或自动化通过 |

Android 本轮的 APK 验证运行于 Android 34 模拟器，ADB 中未发现物理手机。因此“实际安装 APK”指真实 APK/WebView 运行，不称为“Android 实机已通过”。微信人工确认也仅限开发者工具编译并进入首页，不等于微信真机验收。

## 2. 当前 Node 覆盖

当前套件为 **241 项**，使用 Node.js 内置 `node:test` / `node:assert/strict`，没有增加游戏运行依赖。环境为 Node 24、npm 11；测试按 `--test-concurrency=1` 顺序运行，避免全局 `wx`、随机数和平台 mock 相互污染。

传统核心向量直接对照微信与 Android 生产模块；其他文件分别覆盖 Web 或三端，范围以各文件的 target 列表为准。`tests/helpers/version-adapter.mjs` 提供三个平台的导入路径，不复制规则。共享模块生成一致性检查不能单独证明所有 Web 业务流程。

| 范围 | 当前断言与主要测试文件 |
| --- | --- |
| 棋盘与生成 | 合法/重叠/越界放置、行列/交叉清除、3×3 区域、无路判断；形状/旋转、三档配置、保底、重试上限、家族抽样、历史恢复、压力夹具和有限样本模拟。`board`、`piece-generation`、`piece-family-sampling`、`piece-generation-simulation`、`rack-history-consistency` |
| 计分与资格 | 放置和 1–4 线冻结向量、统一返回对象、最高分单调更新、管理员/不合资格成绩排除。`score`、`high-score-monotonic`、`game-state` |
| 道具/撤回/复活 | 成功才扣次数、清除道具不加分、撤回恢复业务状态并扣一次、快照不可重用、复活保留分数与资格并清除旧撤回、失败复活进入结束。`game-state`、`rack-history-consistency`、`presentation-upgrade` |
| 存档 | 默认值、缺失/错误数据、三档最高分、旧单分数迁移、非法 JSON、存储失败与兼容处理。`storage`、`storage-failures`、`high-score-monotonic` |
| 表现与输入 | 拖拽阶段/释放连续性、触摸会话/结束坐标/cancel、事件只发一次、清线原颜色与交叉去重、落下期间绘制归属、得分显示、工具反馈、暂停冻结、到期释放、模态开关与输入门禁。`feedback-state`、`input-feedback`、`touch-session`、`ui-motion`、`modal-closing-input`、`presentation-upgrade`、`tests/shared/` |
| 布局与性能预算 | 小屏/大分数/胶囊夹具的几何约束、按需调度、DPR 与缓存上限、统计样本上限、资源映射/体积/同步边界。`layout-metrics`、`modal-layout`、`render-scheduler`、`resource-budget`、`platform-manifest`、`sync-integrity`、`apk-asset-boundary` |
| 运行时适配 | Web/Android Main 的 mock 生命周期与 viewport；微信实际 Main 注册在 mock `wx` 上的触摸、hide/show、resize 回调、空闲停帧与旧反馈不重播；浏览器音频 mock 的生命周期。`main-runtime`、`android-lifecycle`、`viewport-events`、`wechat-runtime`、`web-audio-stability` |

表中未带扩展名的文件位于 `tests/parity/`，扩展名为 `.test.mjs`。

计分返回结构已统一：`placementScore`、`lineClearScore`、`bonusScore`、`totalAdded`、`clearedLines` 始终存在，且 `totalAdded` 为三类得分之和。撤回扣次和复活后旧快照失效已是当前基线，不再记作待修复差异。

Node 的随机数、时钟和 Storage mock 在测试后恢复；这些隔离说明仅适用于 Node 测试。浏览器和独立 QA APK 会读写各自测试目标的真实 localStorage。未知设置字段保留是现有兼容行为。本轮不改存档键、字段名或迁移策略。

有限生成模拟验证统计输出和约束，不是长期概率分布或玩家体验的统计证明；历史抽样百分比也不作为本候选的新测量结果。

## 3. Web 与微信 Chromium host

`tests/browser/high-score.mjs` 在 1280×900 和 390×844 下使用同一浏览器上下文中的两个真实页面，检查过期页面/相等/更高纪录、管理员排除、重置取消/确认和重载。合法候选由夹具设置，放置走真实 GameState 方法；这个脚本不声称测试 Canvas 拖拽。

`tests/browser/quality.mjs` 的六组用例明确分为：

- **Web 五组**：1280×900 / DPR 1.25；390×844 / DPR 3 / 触摸；320×568 / DPR 3 / 触摸；768×1024 / DPR 2；360×640 / DPR 2.5 / 触摸 / 减少动画与安全区夹具。
- **微信 Chromium host 一组**：390×844 / DPR 3 / 触摸，运行微信平台代码；不是原生微信。

每组通过原始唯一 Main 的真实鼠标/CDP 触摸链，检查首页/难度、拿起、失败返回、合法放置、暂停、撤回、单线/交叉/三线、3 秒窗口内连击、刷新/清除、复活和 Game Over/重开。复活资格由明确的本地授权状态夹具提供，不证明认证。暂停清线测试直接打开状态弹层，沿用原有清线输入锁，不声称清线锁期间可点暂停按钮。

同时断言主画布可见、无启动错误、交互阶段无 JS/console error、反馈结束后停帧、缓存受限，以及局部/完整重绘像素的通道差异最多为 1。保存截图供目视检查；这不是所有动画时刻的参考图逐像素回归。安全区由夹具提供，不是真实刘海设备的测量。

Web 390×844 连续拖动压力目标为 30 秒；微信 host 为 10 秒。报告记录实际时长、帧数、焦点/隐藏状态、局部重绘数量和缓存大小。render 时长仅为 Canvas JS 调用耗时，不等于 GPU 栅格耗时、触摸延迟或完整帧率。声音和震动的自动断言验证触发次数与语义，不证明听感或物理震动。

## 4. 已安装 Android APK

`tests/browser/android-quality.mjs` 需要指定独立 QA 目标，并先安装当前构建的 debug APK。脚本连接该 APK 的原始 WebView，通过不暂停的条件断点暴露唯一 Main；不修改生产入口、不创建第二个实例。实际载入 Renderer 必须逐字等于当前源码。

覆盖同一触摸流程、30 秒连续拖动、6 次 ADB Home/Activity 恢复、后台取消触摸/停帧且棋盘不变，以及 force-stop/重启后设置与最高分保留。Home 后由 Node 限时 5 秒轮询真实暂停/停帧状态，保留取消输入和棋盘断言；不在停止计时器的 WebView 内等待 RAF，也不把固定 180 ms 当作系统过渡完成。报告记录每次实际等待。它没有使用 Android 返回键，也不证明系统回收后的整局棋盘存档；当前回归仅断言已有设置和最高分键。

APK 资源验证分两层：`verify:apk-assets` 只检查禁止的 `assets/js/js/` 嵌套边界；发布前另将 ZIP 内 **35 个游戏 assets 文件**的路径集合和 SHA-256 与当前 `app/src/main/assets/` 比对，确认无缺失或旧资源。debug 包应只有这 35 个文件；release 包另外包含 AGP 生成的 `assets/dexopt/baseline.prof` 与 `baseline.profm`，分别与本次 `compileReleaseArtProfile` 的二进制中间产物比对，不允许其他多余资源。仅边界检查通过不能称为资源内容一致。

仅 debug 包启用 WebView 调试；release 编译、是否签名、是否安装运行分别记录。未安装的 release 构建不能声称通过 release 运行时验收。

## 5. 复现命令与构建

从仓库根目录运行：

```powershell
npm test
npm run verify
npm run verify:assets
```

`npm run test:parity` 仅运行 parity 子集，不能替代完整 241 项。当前 `npm run verify` 检查 11 个共享文件在三个目标中的生成一致性；`verify:assets` 检查音频映射、缺失/未使用文件与体积预算，微信 light 与 Web/Android full 分级保留。

复用现有 Playwright 或 CI 的隔离工具目录，不安装游戏依赖：

```powershell
$env:QA_PLAYWRIGHT_PACKAGE='<现有 Playwright 包目录>'
$env:QA_SCREENSHOTS='<仓库外的证据目录>'
node tests/browser/high-score.mjs
node tests/browser/quality.mjs
```

Android 使用已有 JDK 17、SDK 和仓库 Gradle Wrapper。在 `we xin xiao cheng xu-android-apk/` 中运行：

```powershell
$env:JAVA_HOME='<已有 JDK 17 根目录>'
$env:ANDROID_HOME='<已有 Android SDK 根目录>'
.\gradlew.bat assembleDebug assembleRelease --no-daemon
```

现有 `gradle.properties` 已设置 `android.overridePathCheck=true`，当前路径可直接构建；临时英文盘符映射属于旧轮次做法，不是当前前置条件。不改 AGP/Gradle/SDK 版本或签名配置。

从 Gradle/Manifest 读取 applicationId，安装到明确的独立 QA 目标，待启动后从根目录运行：

```powershell
$env:ANDROID_HOME='<已有 Android SDK 根目录>'
$env:QA_ANDROID_SERIAL='<独立测试目标编号>'
$env:QA_PLAYWRIGHT_PACKAGE='<现有 Playwright 包目录>'
$env:QA_SCREENSHOTS='<仓库外的证据目录>'
node tests/browser/android-quality.mjs
npm run verify:apk-assets
```

浏览器构建为静态 HTML/ES modules，无单独的 bundler/build 命令；以模块/资源检查和本地入口实际运行验证。构建输出、日志、JSON 与截图保留在忽略目录或仓库外，不提交 APK、缓存、机器路径和私有配置。

## 6. 微信人工记录与未验证边界

2026-10-04 上一轮记录：微信开发者工具 Stable 2.01.2510290、基础库 3.15.2；用户人工确认当前项目编译并进入首页。确认范围仅到首页，不能推断已完成下列操作。

上一轮 CLI 曾返回自身窗口代码中的 `TypeError: d.on is not a function`。本轮发布复查中 CLI `auto` 已成功，自动化端口也返回上述工具/基础库版本；但 `App.callFunction` 仍在 8 秒内未响应。因此记录为“原生自动交互未验证”，不能继续把旧窗口错误称为本轮 CLI 失败。本轮没有新增人工验收，不更换运行时冒充微信，不伪造成功或绕过工具限制。

以下原生微信/真机项目未验证：

- 拿起、长拖、快速释放、边缘吸附、合法落下、失败返回及 touchcancel；单线/多线/连击的实际节奏。
- 刷新、清除、撤回、福利复活、新纪录、暂停恢复、结束和重开；确认反馈各播放一次。
- 真实音效听感/重叠、BGM 后台停止和恢复、开关设置、真实震动强度。
- hide/show、尺寸变化、实际胶囊/刘海/底部安全区、小屏和高 DPR；真实设备的帧率、触摸延迟、GPU/内存表现。
- 微信原生 Storage 重启持久性。

Android 物理手机尚未连接，本轮只有第 4 节的已安装模拟器 APK 自动化。物理手机安装包交互、音效、震动、安全区、系统返回键及设备性能未验证，独立于微信人工验收记录。

微信登录、后端健康检查、远程管理员资格、云端配置和微信上传不属于本轮回归。GitHub Release 和 Pages 发布另按既有流程验收，不将其混入原生交互证据。

## 7. 最终回归记录

2026-10-04 在 `v1.0.12` 发布工作树上重新运行，以下均为本轮本地结果。环境：Node 24.15.0、npm 11.12.1、Playwright 1.63.0 / Chromium、JDK 17、Gradle Wrapper 8.7；Android 使用独立 Android 34 Google APIs x86_64 模拟器及软件 GPU，逻辑视口为 393×806。未连接物理手机。

| 检查 | 本轮结果与边界 |
| --- | --- |
| `npm test` | **241/241 通过**，0 失败、跳过、取消或 TODO；实际耗时 10.05 秒 |
| `npm run verify` | 11 个共享文件在三个目标中一致 |
| `npm run verify:assets` | 三端音频映射/缺失/未使用/体积检查通过；微信 light 11 文件 / 2,931,409 bytes，Web 与 Android full 各 11 文件 / 26,936,009 bytes；后两端的 11 个音频 SHA-256 另行逐一比对一致 |
| Web Chromium | 第 3 节的五组视口全部通过；两组跨页最高分/localStorage 回归通过 |
| 微信 Chromium host | 第 3 节的一组真实平台代码流程通过；仅代表 shim host，不能记为原生微信通过 |
| Android 构建 | `assembleDebug assembleRelease --no-daemon` 成功，85 项任务；release 的 `lintVital` 随构建通过，不等于运行了全面 lint 或类型检查 |
| APK 资源 | debug 和 unsigned release 各有 35 个游戏 assets 与当前源码路径/字节哈希一致；release 另外两项编译 profile 与本次 AGP 中间产物一致；两个 APK 的禁止嵌套边界检查通过；debug 签名验证通过 |
| 已安装 v1.0.12 debug APK | 原始 WebView 载入的 Renderer 与源码一致；触摸流程、6 次 Home/Activity 后台恢复和 force-stop/重启后的设置/最高分持久性通过；JS/console error 为 0，无 AndroidRuntime 崩溃；原生日志有 WebView `Failed to write a new fake index` 缓存诊断，不写成全部错误日志为空 |
| 微信原生自动交互 | **未验证**：本轮 CLI 连接成功，执行接口仍 8 秒超时；人工确认仅沿用上一轮编译/首页，边界列于第 6 节 |

收尾中首次 APK 后台断言在固定 180 ms 后失败；检查实际 Activity/WebView 时已处于 hidden、paused、RAF=0、无拖拽状态。修正回归等待方式后，完整 6 次实际后台等待为 227 / 163 / 308 / 313 / 103 / 112 ms，并通过原有取消输入与棋盘一致性断言，未改产品生命周期代码。

另一次 QA 运行被 Windows 记录的 QEMU 原生崩溃（`0xc0000005`）中断，该轮不计为通过或性能证据。重启独立模拟器后完成下面这轮 `v1.0.12` 全部检查。旧正式 `v1.0.11` APK 的实际升级检查保留了既有设置和三档最高分；新 Debug 包证书与该旧发布一致，均为 Android Debug 证书，不是生产签名。

本轮压力记录均保持焦点且未进入后台，所有记录的拖动帧均为局部重绘；反馈到期后停帧断言通过：

| 目标 | 实际拖动时长 | 帧数 | Canvas JS render p95 |
| --- | --- | --- | --- |
| Web 390×844 | 30,079 ms | 1,806 | 0.50 ms |
| 微信 Chromium host | 10,069 ms | 604 | 0.40 ms |
| Android v1.0.12 debug APK / 模拟器 | 30,141 ms | 705 | 7.20 ms |

这些数据不表示物理手机帧率或触摸延迟。三个压力目标各有 2 项缓存，主画布与缓存总像素均在对应预算内；局部/完整重绘像素比较通过。JSON/日志/截图分别保存为 `quality-results.json`、`android-results.json`、`apk-resource-results.json`、`wechat-final.json` 等仓库外证据，未加入提交。

APK 身份（均为本轮构建；`versionCode=12`、`versionName=1.0.12`；保留已发布 `v1.0.11`，按既有版本/Tag 同号递增惯例建立新发布）：

- `app-debug.apk`：34,040,874 bytes；SHA-256 `11da098973a5b2d3bba9d9ad4e07813336cb3122d9878bac399762f8d38237f1`。已安装到上述模拟器验证，发布附件明确标为 Debug preview。
- `app-release-unsigned.apk`：32,896,914 bytes；SHA-256 `d3f1ab998de5a0b62a17f3fb17dce6b1ac42e1cbfcd9c02f172e556ca44f8dfe`。签名检查确认未签名，不能直接安装；未验证 Release 运行时。

物理 Android 手机和微信真机未验收；真实听感、震动、安全区及第 6 节原生项目保持未验证。上述本地数据不代替远程 CI 或线上检查；最终 commit、Tag、附件校验和、GitHub Actions 与 Pages 身份以 [v1.0.12 Release](https://github.com/seiya058904/Relax-Block-Puzzle/releases/tag/v1.0.12) 的实际记录为准。

## 8. 失败定位与提交门槛

先按失败名称和 target 找到真实生产模块，核对原规则与夹具；不要先改期望或放宽断言。实际交互失败需保留截图/状态/错误；3 秒连击必须记录真实清线间隔，压力测试必须记录真实时长及是否后台中断。

全部要求的本地自动化、资源与必要构建通过，审查 `git diff --check`、变更范围、生成文件和敏感数据后才提交。未验证的物理设备或微信人工项如实保留；不把它们记作通过。提交不含依赖升级、二进制产物或私有配置。

按既有流程推送最终 main，运行对应 commit 的 CI、浏览器工作流和 Pages；核对线上静态文件及真实浏览器流程。正式 Tag、Release 和 APK 必须对应该最终版本，旧 Tag/Release 不改写；unsigned 和 Debug preview 明确区分。发布结束后移除本项目测试缓存/临时 QA 目标，检查本地与 origin/main 为 0/0、工作区干净。
