# 三端验证基线与验收边界

更新：2026-10-04。范围：当前本地品质升级候选；不改变 10×10、计分、生成、道具、撤回、复活、最高分资格或存档格式。

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

覆盖同一触摸流程、30 秒连续拖动、6 次 ADB Home/Activity 恢复、后台取消触摸/停帧且棋盘不变，以及 force-stop/重启后设置与最高分保留。它没有使用 Android 返回键，也不证明系统回收后的整局棋盘存档；当前回归仅断言已有设置和最高分键。

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

## 6. 微信人工记录与物理设备待验收

2026-10-04 上一轮记录：微信开发者工具 Stable 2.01.2510290、基础库 3.15.2；用户人工确认当前项目编译并进入首页。确认范围仅到首页，不能推断已完成下列操作。

本轮最终复查：工具 CLI 再次返回自身窗口代码中的 `TypeError: d.on is not a function`；自动化端口可以返回上述工具/基础库版本，但 `App.callFunction` 在 8 秒内未响应。因此记录为“原生自动交互未验证”，保留原错误与超时证据。本轮没有新增人工验收，不更换运行时冒充微信，不伪造成功或绕过工具限制。

待人工在原生微信/真机确认：

- 拿起、长拖、快速释放、边缘吸附、合法落下、失败返回及 touchcancel；单线/多线/连击的实际节奏。
- 刷新、清除、撤回、福利复活、新纪录、暂停恢复、结束和重开；确认反馈各播放一次。
- 真实音效听感/重叠、BGM 后台停止和恢复、开关设置、真实震动强度。
- hide/show、尺寸变化、实际胶囊/刘海/底部安全区、小屏和高 DPR；真实设备的帧率、触摸延迟、GPU/内存表现。
- 微信原生 Storage 重启持久性。

Android 物理手机尚未连接，本轮只有第 4 节的已安装模拟器 APK 自动化。物理手机安装包交互、音效、震动、安全区、系统返回键及设备性能仍待人工确认，独立于微信人工验收记录。

微信登录、后端健康检查、远程管理员资格、云端配置、签名发布和部署不属于本轮本地回归。

## 7. 最终回归记录

2026-10-04 在当前本地候选上重新运行，以下均为本轮结果。环境：Node 24.15.0、npm 11.12.1、Playwright 1.63.0 / Chromium、JDK 17、Gradle Wrapper 8.7；Android 使用独立 Android 34 Google APIs x86_64 模拟器，逻辑视口为 393×806。未连接物理手机。

| 检查 | 本轮结果与边界 |
| --- | --- |
| `npm test` | **241/241 通过**，0 失败、跳过、取消或 TODO；实际耗时 13.36 秒 |
| `npm run verify` | 11 个共享文件在三个目标中一致 |
| `npm run verify:assets` | 三端音频映射/缺失/未使用/体积检查通过；微信 light 11 文件 / 2,931,409 bytes，Web 与 Android full 各 11 文件 / 26,936,009 bytes；后两端的 11 个音频 SHA-256 另行逐一比对一致 |
| Web Chromium | 第 3 节的五组视口全部通过；两组跨页最高分/localStorage 回归通过 |
| 微信 Chromium host | 第 3 节的一组真实平台代码流程通过；仅代表 shim host，不能记为原生微信通过 |
| Android 构建 | `assembleDebug assembleRelease --no-daemon` 成功，85 项任务；release 的 `lintVital` 随构建通过，不等于运行了全面 lint 或类型检查 |
| APK 资源 | debug 和 unsigned release 各有 35 个游戏 assets 与当前源码路径/字节哈希一致；release 另外两项编译 profile 与本次 AGP 中间产物一致；两个 APK 的禁止嵌套边界检查通过；debug 签名验证通过 |
| 已安装 debug APK | 原始 WebView 载入的 Renderer 与源码一致；触摸流程、6 次 Home/Activity 后台恢复和 force-stop/重启后的设置/最高分持久性通过；本次过滤的 AndroidRuntime/chromium 错误日志为空 |
| 微信原生自动交互 | **未验证**：工具内部 `d.on is not a function` 与执行接口 8 秒超时仍在；人工确认仅沿用上一轮编译/首页，后续项保留在第 6 节 |

本轮压力记录均保持焦点且未进入后台，所有记录的拖动帧均为局部重绘；反馈到期后停帧断言通过：

| 目标 | 实际拖动时长 | 帧数 | Canvas JS render p95 |
| --- | --- | --- | --- |
| Web 390×844 | 30,074 ms | 1,805 | 0.70 ms |
| 微信 Chromium host | 10,018 ms | 602 | 0.60 ms |
| Android debug APK / 模拟器 | 30,125 ms | 1,689 | 4.10 ms |

这些数据不表示物理手机帧率或触摸延迟。三个压力目标各有 2 项缓存，主画布与缓存总像素均在对应预算内；局部/完整重绘像素比较通过。JSON/日志/截图分别保存为 `quality-results.json`、`android-results.json`、`apk-resource-results.json`、`wechat-final.json` 等仓库外证据，未加入提交。

APK 身份（均为本轮构建；`versionCode=11`、`versionName=1.0.11` 保持不变）：

- `app-debug.apk`：34,075,935 bytes；SHA-256 `6ab1107f01214a451167885b622d1ff8e6be815eed453205a139a7a23a3f53cb`。已安装到上述模拟器验证。
- `app-release-unsigned.apk`：32,896,918 bytes；SHA-256 `8f74a02aeb47ad55e475b2e8423481d4fab33498bc7dd81c3ac47a5147412f57`。未签名、未安装运行，只完成构建和包内资源检查。

没有重新执行物理 Android 手机或微信真机验收；真实听感、震动、安全区及第 6 节人工项目仍待确认。远程 CI、推送、部署、发布和版本号变更均未执行。

## 8. 失败定位与提交门槛

先按失败名称和 target 找到真实生产模块，核对原规则与夹具；不要先改期望或放宽断言。实际交互失败需保留截图/状态/错误；3 秒连击必须记录真实清线间隔，压力测试必须记录真实时长及是否后台中断。

全部要求的本地自动化、资源与必要构建通过，审查 `git diff --check`、变更范围、生成文件和敏感数据后才提交。未完成的物理设备或微信人工项如实保留；不把它们记作通过。提交不包含依赖升级、版本号变更、产物、私有配置、推送或发布。
