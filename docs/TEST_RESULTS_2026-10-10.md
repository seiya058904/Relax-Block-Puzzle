# Relax Block Puzzle — 测试与验收记录

日期：2026-10-10。参考基线：`4d1c30889c95b4458bb16c2704efba885553316a`。

本报告配合 [审计与修复报告](AUDIT_2026-10-10.md)、根目录 `CLOUD-HANDOFF.md` 和 `audit/` 原始记录使用。报告区分源测试、真实 Chromium 交互、受控宿主/故障注入与尚未执行的原生验收。

## 1. 软件门禁结果

所有命令都从项目根目录运行。先按交接说明恢复 Android 音频，再验证。

| 命令 | 恢复镜像后的原始基线 | 最终修复源码 | 证据 |
| --- | --- | --- | --- |
| `npm test` | 242/242，0 fail | **301/301，0 fail、0 skip** | `audit/baseline/npm-test.log`、`audit/final/npm-test.log` |
| `npm run test:parity` | 222/222，0 fail | **281/281，0 fail、0 skip** | `audit/baseline/parity.log`、`audit/final/parity.log` |
| `npm run verify` | 通过 | **通过，11 模块 × 3 目标无漂移** | 两目录的 `verify.log` |
| `npm run verify:assets` | 通过 | **通过，三端全部资源、路径和预算** | 两目录的 `assets.log` |
| `npm run simulate:generation -- --samples 10000` | exit 0 | **exit 0，非计时结果逐字段相同** | 两目录的 `generation-10000.log` |
| `npm run sync`，重复执行 | 已同步 | **生成副本一致，重复执行无内容变化** | `verify.log` 与当前 SHA-256 清单 |
| `node scripts/restore-android-audio.mjs`，重复两次 | 新交接工具 | **两次成功，11 文件、26,936,009 字节** | `audit/final/audio-restore-first.log`、`audio-restore-second.log` |

原先交接中记录的五项失败没有被当作五个产品缺陷：三项缺失音频镜像和两项 `spawnSync EBUSY` 相关失败，恢复输入并在当前环境重跑后全部消失。其余缺陷来自另行复现的真实路径，而不是原始测试失败数量。

主测试包含 parity，不能把 301 和 281 相加解释为独立测试数。独立代理的部分反例也与新增回归覆盖相同路径，下文按各次执行记录报告，不合计成一个夸大的总数。

## 2. 新增与调整的回归

新增 59 条测试，位于五个文件，全部使用实际平台模块或产品 shim：

| 文件（位于 `tests/parity/`） | 新增数量 | 主要保护 |
| --- | ---: | --- |
| `state-race-regressions.test.mjs` | 15 | 管理员请求归属、不可逆成绩资格、过期写分及清分竞争 |
| `audio-lifecycle.test.mjs` | 6 | 静音即时停止、微信后台音效门禁、BGM 同步不重启 |
| `input-lifecycle-regressions.test.mjs` | 13 | 真实 shim 鼠标所有权/焦点、键盘即时刷新、取消拖动反馈、初始隐藏 |
| `reset-reconcile-regressions.test.mjs` | 19 | 清分提交/失败、读恢复、排队写入、锁内 previous、等值缓存和难度隔离 |
| `paused-clock-viewport.test.mjs` | 6 | 三端 Combo 暂停、短视口冻结与恢复 |

两处既有测试的改变具有明确原因：

- 原 Combo 测试在首页直接触发计时逻辑；现在先开始一局，仍用原来的数值和边界断言，匹配首页不消耗游戏时间的约定。
- 原 blur 检查禁止任何 blur 监听器，只能检查源码字符串。现用实际 shim 事件断言明确验证：失焦取消鼠标拖动，却不调用生命周期隐藏或停止音频。没有放宽触摸/可见性语义。

Board、Piece、DragModel、布局/资源契约及既有概率和 parity 数值断言没有删除或弱化。没有增加永久绘制循环来让刷新测试通过。

## 3. 生成分布和长局不变量

### 3.1 既有生成模拟

命令中的 10,000 指每个难度的样本数，总计 30,000；使用脚本原有固定种子及 empty、quarter、half、fragmented、narrowLanes、nearlyFullRow、nearlyFullColumn、critical 夹具。

| 指标 | easy | normal | master |
| --- | ---: | ---: | ---: |
| 样本 | 10,000 | 10,000 | 10,000 |
| 返回失败数 | 0 | 0 | 5 |
| 返回失败率 | 0% | 0% | 0.05% |
| 成功候选中零个即时可放方块比例 | 0 | 0 | 0 |
| 完整三步可放比例 | 100% | 89.78% | 约 79.98% |
| 所有非计时字段相对基线 | 相同 | 相同 | 相同 |

master 的 5 次失败原基线即存在。`UNIFIED_SPEC` 明确保留最多 20 次尝试及显式失败返回；最后的放宽阶段要求至少一个可放置方块，并不保证全部三块都能依次放下。这不是数学上无合法移动的证明，也不是修改概率以降低难度的理由。代码及上述全部分布/历史/救援统计没有改变。

计时数据也保留在原日志中，但测试在共享容器及并行任务下运行，不能据此宣称生成器加速或退化。此次没有性能相关生成器修改。

### 3.2 独立长局 oracle

`audit/core/long-game-invariants.mjs` 使用独立 occupancy/行列清除/计分计算，分别对三端、三难度、12 个种子操作；每局最多 400 步。结果为：

| 检查 | 结果 |
| --- | ---: |
| 游戏局数 | 108 |
| 合法放置 | 23,136 |
| 清除的行/列 | 5,715 |
| 无效拖放 | 2,166 |
| 撤销 / 刷新 / 清除道具 | 105 / 213 / 69 |
| 跨端重放配对 | 72 对，全部一致 |
| 单局最多步骤 / 最高观测分 | 400 / 28,520 |
| 最终与基线完整结果 JSON | **完全相同** |

证据：`audit/core/long-game-baseline-results.json`、`long-game-results.json` 和 `audit/final/long-game-invariants.log`。既有 HUD 高分测试覆盖至 2,147,483,647；有限长局测试没有建立任意长时间累积到 JavaScript 安全整数上界后的保证，因此未凭人工超大值注入改变分数规则。

## 4. 真实浏览器回归

浏览器插件不可用，使用仓库原有 Playwright 脚本和环境中已有浏览器：Playwright **1.62.1**、Chromium Headless Shell **141.0.7390.37**。默认 Playwright 要求的另一浏览器 revision 不在环境中，使用既有可执行文件覆盖启动路径，没有安装/升级仓库依赖。详见 `audit/final/environment.json`。

### 4.1 仓库原有高分与质量脚本

| 运行 | 覆盖和结果 | 原始日志 |
| --- | --- | --- |
| 高分：Web docs | 2 视口 × Web Locks/IndexedDB，4/4 通过 | `browser-high-score-web.log` |
| 高分：Android assets | 相同矩阵，4/4 通过 | `browser-high-score-android-host.log` |
| 质量：Web docs | 5 个 Web 配置 + 1 个微信 Chromium 宿主配置，全部通过 | `browser-quality-web.log` |
| 质量：Android assets | 5 个 Android assets 配置 + 同一微信宿主配置再次运行，全部通过 | `browser-quality-android-host.log` |

上述日志位于 `audit/final/`，质量 JSON 位于 `audit/browser/quality-web/` 与 `quality-android-host/`。脚本内部对 Android assets 仍用 `web-*` 测试名称；本报告以实际资源根目录区分两次运行，没有把 Android 浏览器资源检查误称原生 APK。

质量回归包括真实鼠标/触摸的合法和非法拖放、撤销、1/2/3 行列消除、Combo、道具、暂停、复活、游戏结束、缓存与停帧，以及 DPR、安全区、缩放/尺寸变化和 reduced-motion。微信宿主还检查 idle 后的延迟管理员成功/失败/异常回调、隐藏期间不调度及恢复刷新。

压力观测为 Web 390 配置 30,092 ms/1,683 帧，render p95 1.30 ms；Android assets 390 配置 30,066 ms/1,788 帧，p95 0.60 ms；微信 Chromium 宿主约 10 秒，p95 0.70 ms。它们是此容器本次运行的观测，不是原生 FPS、设备基准或修复后的加速比例。

### 4.2 独立真实输入反证

Input Auditor 在原始资源和修复资源上运行同一浏览器：修复后 Web 矩阵 **42/42**、补充键盘缩放 **11/11**、Android assets 宿主 **43/43**。这 96 个记录包含跨端/不同运行的重复路径，不是 96 种独立用户流程。

验证了以下实际结果：

- 原 Web 568×320 的 `arcTo` 半径 -11 启动错误消失；568×320、640×360 显示方向/尺寸提示，无残留点击区，RAF 为 0。
- 1280×900、390×844、320×568 的正常玩法保留；短视口恢复后继续同一棋盘/三件套/分数。
- 正在 180 ms 清线时缩小，等待 500 ms 仍保持 pendingClear；恢复后只结算一次至 160 分。
- 原生 DOM 键盘回调立即绘制，无效福利码错误保留；输入 `INVALID-AUDIT`，缩小后继续输入 `Z` 再恢复，状态和 Canvas 都为 `INVALID-AUDITZ`。
- 鼠标字段点击保持原生 input 焦点；受控 blur 加实际 CDP `buttons=0` 取消旧拖动，下一点击不落旧方块。
- 三次最终运行均无 page error / console error。

证据含 `audit/input/BROWSER-QA-REPORT.md`、四组 `browser/*/report.json` 及完整对应截图。原始 baseline 中的失败 health check 是缺陷证据，不算通过的验收项。

### 4.3 实际跨页并发

独立 Concurrency Auditor 使用真实 Web Locks 与 IndexedDB 各验证旧写分完成后同难度首页可信刷新；两种路径均为存档 10、显示 10，且无浏览器错误。

另用真实 IndexedDB 双页面自然 storage 事件捕获 15 个关键交错（3 类 × 5 次）：事件只改 easy 而 fresh normal 是自身 10；外部 normal 20 而 fresh 已是自身 30；外部清零而 fresh 已是自身 10。最终庆祝阈值分别为 0、20、0，均符合事件来源。捕获这些交错分别用了 37、130、27 轮；这是实际命中的验证，不是没有命中就宣称通过。

证据：`audit/concurrency/browser/event-source-checks.json`、`results.json` 和 `REDTEAM-FIX-REVIEW.md`。早期探索的 `natural-event-race.json` 空数组保留为历史记录，不能替代上述后续有效捕获结果。

## 5. 独立反例、资源与初始隐藏

| 专项 | 结果与范围 |
| --- | --- |
| Red-Team 状态反例 | 24 条通过，覆盖高影响管理员/撤销路径与难度/局代际等 |
| Red-Team 实际 Main 回调 | 6 条通过，延迟完成、隐藏和 idle 守护 |
| Combo 时钟反证 | 36 条通过，三端嵌套暂停、3000/3001 ms、撤销/新局/复活、短视口 |
| 最后追加的初始可见性反证 | 10 条通过；原版同脚本 6 pass/4 fail；追加后未声称重新跑过前述完整 66 条 |
| 清分未知结果与恢复 | 独立 13 条边界 + 4 条等值缓存反例全部通过；与源回归有覆盖重叠 |
| Web/Android 低层存储失败矩阵 | 协调器不可用、锁拒绝、读取/迁移失败、写入失败和事务异常均按既有保护规则处理 |
| 音频池压力 | 每端 200 次 hide/换曲/恢复/静音周期；最多 7 效果 context + 1 BGM，隐藏后播放中对象 0 |
| 实际 Web/Android shim 音频释放 | 各 200 次 BGM 替换；重试集合最多 1，最终 0，旧 Audio.src 释放 |
| Canvas 缓存压力 | 每端 1,000 次重建；微信最大 750,000 像素，Web/Android 最大 1,249,524；均在预算内，清理后 0 |
| 音频文件 | 微信 11 文件/2,931,409 bytes；Web/Android 各 11 文件/26,936,009 bytes；原编码 SHA-256 不变 |
| MP3 检查 | 22 个保留编码文件通过 ffprobe 格式和正时长检查 |

初始隐藏用例运行实际 shim/Main，但 `document.hidden=true` 为受控初始浏览器状态。修复后 Main、GameState、SoundManager 初始均暂停；保存 BGM 开启也为 play=0、RAF=0，前台恢复按设置播放。已有 headless shell 的自然 background/frozen target 仍报告 visible，不能以此声称自然后台标签页或原生冷启动已实测。

## 6. 可复现命令

Node 软件门禁不需要先安装依赖：

```bash
node scripts/restore-android-audio.mjs
node scripts/restore-android-audio.mjs
npm test
npm run test:parity
npm run verify
npm run verify:assets
npm run simulate:generation -- --samples 10000
```

共享源码修改后必须 `npm run sync`，再次执行应无内容变化。当前 ZIP 的哈希清单对应未恢复镜像的包内内容；恢复出的 Android 音频由恢复工具和 assets 门禁逐文件验证。

在已有 Playwright/Chromium 的环境运行浏览器脚本：

```bash
node tests/browser/high-score.mjs
node tests/browser/quality.mjs
```

`QA_DOCS_ROOT` 可切换到 Android assets；`QA_SCREENSHOTS` 指定输出，`QA_PLAYWRIGHT_PACKAGE` 指定已有模块。本轮使用的可选启动包装器为 `audit/browser/playwright-existing.cjs`，需要 `CODEX_PRIMARY_RUNTIME_NODE_MODULES` 与 `QA_CHROMIUM_EXECUTABLE` 指向本机已有依赖/浏览器；它不属于产品启动文件。可移植的完整示例及独立探针运行说明见 `audit/README.md`。

## 7. 明确未执行的验收

| 门禁 | 状态 / 原因 |
| --- | --- |
| Android `assembleDebug` | 未执行：容器缺 Android SDK；保留 JDK17、现有 Gradle/AGP/SDK 配置 |
| `npm run verify:apk-assets` | 未执行：无新建 APK、PowerShell |
| Android 设备/模拟器回归 | 未执行：无 adb、模拟器或设备；Activity、WebView、外接鼠标、系统 IME、进程回收需原生验证 |
| 微信开发者工具与真机 | 未执行：无工具/设备；原生键盘、音频、系统中断和真实 API 行为需验收 |
| 中文字体最终视觉 | 容器无 CJK 字体，截图中文字可能为方框；真实文本值及布局已检查，设备字形未检查 |
| 任意长期数值稳定性、系统极限内存/context 回收 | 有限压力范围通过；没有把有限测试扩大成无限时间或原生系统回收保证 |

已有 Windows Android 流程见 `CLOUD-HANDOFF.md`；没有为了绕过工具缺失升级工具链、发布 APK、修改签名或访问生产后端。
