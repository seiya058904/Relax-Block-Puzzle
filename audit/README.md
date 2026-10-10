# 审计证据索引与重跑说明

本目录保存 2026-10-10 对参考提交 `4d1c308` 的独立审计证据。最终结论以 [`docs/AUDIT_2026-10-10.md`](../docs/AUDIT_2026-10-10.md) 和 [`docs/TEST_RESULTS_2026-10-10.md`](../docs/TEST_RESULTS_2026-10-10.md) 为准。

独立报告保留发现时的路径、局部编号及中间反证记录，部分绝对路径属于原审计工作目录。打包时没有把早期结论伪装成最终结论，也没有把故意复现旧 Bug 的脚本列入最终通过门禁。下表说明每类证据的用途。

## 1. 文件导航

| 位置 | 内容与解释 |
| --- | --- |
| `baseline/` | 先恢复 Android 音频后，对原始输入运行的测试、parity、资源及生成日志；原有五项失败全部复验通过 |
| `final/` | 最终源码门禁、浏览器矩阵、长局及环境记录；主测试301、parity281 |
| `core/` | 核心独立报告、管理员/Combo 复现、108局 oracle 及基线/最终 JSON |
| `concurrency/` | 并发原始审计、最终反证接受报告、真实双页面事件证据和错误注入探针 |
| `input/` | 输入/渲染报告、真实浏览器基线与修复后的 JSON、截图；包含96条记录但有重复路径 |
| `resource/` | 音频/缓存压力、编码和 SHA-256、受控初始隐藏、旧恢复命令复现；3个小型原始 SoundManager 样本仅作为审计材料 |
| `cross-platform/` | 独立权威边界、41个受保护文件、124条相对导入检查；早期快照的 added 数量自然少于最终含报告的文件数 |
| `redteam/` | 高影响反例、时钟复审、最后追加的初始隐藏反证；baseline/patched/final 前缀标记不同阶段 |
| `browser/` | 仓库原有浏览器回归的全部结果 JSON、高分截图和精选质量截图，以及可选浏览器启动包装器 |
| `baseline-input-manifest.json` | 原上传 ZIP 全部226文件的原始 SHA-256，路径→哈希映射 |
| `source-change-inventory.json` | 最终产品/测试/交接文件相对原 ZIP 的改动清单，不把音频镜像或审计截图算作产品修改 |
| `CHANGES.patch` | 相对原 ZIP 的源码、测试、恢复脚本及交接文档差异；包含由 sync 生成的副本；不重复嵌入此证据目录或哈希清单 |
| `screenshots.json` | 实际随包68张截图的名称、字节数、哈希；未收录的质量截图可用原脚本再生成 |
| `probe-portability.json` | 探针在交付时只改源码/浏览器/输出路径的前后哈希；保留原断言 |
| `source-path.mjs` | 仅服务独立探针的路径工具，产品不会导入 |

原始完整 ZIP、临时 `input/baseline-web` 音频副本、`redteam/baseline` 整树、依赖和浏览器缓存不随包重复携带。Android 重复音频先用 `node scripts/restore-android-audio.mjs` 恢复。微信轻量音频保持独立。

## 2. 最终门禁和额外探针

优先运行仓库正式命令，完整顺序见 `CLOUD-HANDOFF.md`。以下是可选的独立补充验证，从项目根目录执行：

```bash
node audit/core/long-game-invariants.mjs
node audit/concurrency/storage-fault-matrix.mjs
node --test audit/concurrency/reset-reconcile-boundaries.test.mjs audit/concurrency/pending-threshold-equality.test.mjs
node audit/redteam/adversarial-state.mjs
node audit/redteam/lifecycle-callbacks.mjs
node audit/redteam/combo-clock-countercases.mjs
node audit/redteam/initial-visibility-countercases.mjs
node audit/resource/lifecycle-resource-probes.mjs
python3 audit/cross-platform/inspect-boundaries.py . audit/baseline-input-manifest.json audit/rerun/cross-platform
```

`npm test` 不会自动运行 audit 目录中的历史探针。独立探针默认读取当前包的源码；`AUDIT_SOURCE_ROOT=/绝对/源码目录` 可切换输入，Red-Team 还保留原 `REDTEAM_SOURCE_ROOT` 覆盖。新输出默认进入 `audit/rerun/`，`AUDIT_OUTPUT_DIR` 可指定另一目录，保留交付时的原始证据。跨平台脚本本来就要求显式输出目录。

长局会输出新的 `audit/rerun/core/long-game-results.json`，可以与保留的基线 JSON 比较。`source-change-inventory.json` 和根目录哈希清单描述本次交付内容，重跑生成的新日志不在清单中。

## 3. 浏览器重跑

需要本机已有 Playwright 与 Chromium。仓库正式脚本支持 `QA_PLAYWRIGHT_PACKAGE`、`QA_SCREENSHOTS`、`QA_DOCS_ROOT`。若已有模块正常找到自己的浏览器，直接运行 `tests/browser/high-score.mjs` 和 `tests/browser/quality.mjs` 即可。

若要像本次审计一样复用另一已有 Chromium，可配置所附包装器。下面路径需要替换成实际本机路径；不需要改产品或工具链：

```bash
export CODEX_PRIMARY_RUNTIME_NODE_MODULES='/absolute/path/to/node_modules'
export QA_CHROMIUM_EXECUTABLE='/absolute/path/to/chromium'
export QA_PLAYWRIGHT_PACKAGE="$PWD/audit/browser/playwright-existing.cjs"
QA_SCREENSHOTS="$PWD/audit/rerun/high-score-web" node tests/browser/high-score.mjs
QA_SCREENSHOTS="$PWD/audit/rerun/quality-web" node tests/browser/quality.mjs
QA_DOCS_ROOT="$PWD/we xin xiao cheng xu-android-apk/app/src/main/assets" QA_SCREENSHOTS="$PWD/audit/rerun/high-score-android" node tests/browser/high-score.mjs
QA_DOCS_ROOT="$PWD/we xin xiao cheng xu-android-apk/app/src/main/assets" QA_SCREENSHOTS="$PWD/audit/rerun/quality-android" node tests/browser/quality.mjs
```

独立浏览器探针也支持 `QA_PLAYWRIGHT_PACKAGE` 和可选 `QA_CHROMIUM_EXECUTABLE`，不需要包装器才能指定浏览器。检查最终输入修复时必须加 `--fixed`：

```bash
node audit/input/browser-qa.mjs --fixed
QA_INPUT_ROOT="$PWD/we xin xiao cheng xu-android-apk/app/src/main/assets" QA_INPUT_OUTPUT="$PWD/audit/rerun/input/android" node audit/input/browser-qa.mjs --fixed
node audit/concurrency/browser-fix-check.mjs
node audit/concurrency/browser-event-source-checks.mjs
```

并发浏览器探针支持 `QA_DOCS_ROOT`、`QA_CONCURRENCY_OUTPUT`；输入探针保留 `QA_INPUT_ROOT`、`QA_INPUT_OUTPUT`。`browser-fix-check` 和早期 `browser-natural-event-race` 含诊断 JSON，不是所有健康结论都由退出码表达，必须检查实际结果。后者的早期空结果不作为成功证据；最终有效自然调度证据在 `browser/event-source-checks.json`。

所有 Android assets 与微信 host 浏览器运行都只是对应 JavaScript 资源的 Chromium 验证，不能代替原生 SDK、APK、WebView 或微信开发者工具。

## 4. 历史故障探针的适用版本

以下脚本刻意断言旧 Bug 存在，只有指向原始基线时才应出现它们记录的“复现成功”。在修复版失败不等于回归：

- `concurrency/reproduce-state-races.mjs`
- `concurrency/reproduce-storage-event.mjs`
- `input/repro-input.mjs`
- `input/repro-audio-redteam.mjs`

`concurrency/repro-fix-counterexamples.mjs` 针对中间修复快照，是历史反证材料；原始 ZIP 和最终版都不是该脚本的精确中间输入。`core/admin-undo-repro.mjs` 断言的是应成立的产品不变量，原版失败才是其缺陷证据。其他诊断脚本的输出应结合其报告解释，不应以所有 `.mjs` 盲目执行后是否 exit 0 作为验收。

输入浏览器的 `--baseline` 模式要求显式设置 `QA_INPUT_ROOT` 指向另外解出的原始 Web 目录；缺少此参数会报告错误，不会偷偷使用修复版作为基线。需要基线完整源码时使用原上传 ZIP，或只读获取参考提交；后者不含未推送的本轮修复。

`resource/verify-resource-recovery.py` 需要原始 ZIP 作为位置参数：

```bash
python3 audit/resource/verify-resource-recovery.py /absolute/path/to/original-handoff.zip
```

这个历史脚本用 GNU/POSIX `cp` 复现旧命令的嵌套目录问题；它不是正式恢复流程，不能拿最终 ZIP 替换原始输入。新的正式恢复命令 `node scripts/restore-android-audio.mjs` 使用 Node，在支持该项目 Node 工具的系统上可重复执行。

## 5. 证据边界

真实浏览器截图未经图像生成或改绘。容器缺 CJK 字体，中文方框不代表产品新缺陷；文本内容与几何另有实际 Canvas 记录。初始 hidden、存储失败、管理员认证响应和部分生命周期由受控 fixture 提供，各报告均标明，没有访问生产认证后端。没有原生 SDK、微信开发者工具或设备的门禁保持未执行。
