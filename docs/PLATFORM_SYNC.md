# 三端同步边界

## 当前关系

- 微信产品源码：`we xin xiao cheng xu/`
- 网页构建目录：`we xin xiao cheng xu-android-apk/docs/`
- Android WebView 资源目录：`we xin xiao cheng xu-android-apk/app/src/main/assets/`
- 共享源码：`shared/js/`
- 清单：`config/platform-manifest.json`

统一仓库以本项目根目录为边界，三端、共享源码和验证脚本均在同一仓库中。源码交接 ZIP 不包含 `.git`；解压后的目录没有 Git 历史，不代表 Android 子目录是另一个权威仓库。以交接说明记录的基线和文件清单核对离线修改。

## 命令

```powershell
npm run sync
npm run verify
npm run verify:assets
npm test
```

同步脚本只处理 `config/platform-manifest.json` 中的 `generated` JS 文件。生成副本第一行带有：

```js
// GENERATED FILE - edit shared/js source and run npm run sync.
```

不要直接编辑带有该标记的文件；平台入口、HTML、`browser-wx-shim.js`、Canvas/DPR、生命周期、Kotlin 外壳和音频目录均不参与同步。

## 文件分类

共享基线：`Board.js`、`Piece.js`、`ScoreManager.js`、`utils/storage.js`、`coreConstants.js`、`DragModel.js`、`FrameInputQueue.js`、`SafeHitArea.js`、`RenderPerfStats.js`、`Presentation.js` 和 `config/quality.js`。

平台独立：`GameState.js`、`InputManager.js`、`Renderer.js`、`LayoutMetrics.js`、`constants.js`、`main.js`、`render.js`、HTML、shim、Android Kotlin 和全部音频。上述平台层现在调用共享拖拽模型和输入队列，但仍保留各自的生命周期、Canvas/DPR 和 Renderer 适配。

目录状态：`shared/js/` 是共享源代码；三个目标目录中的带生成标记 JS 是生成副本；各端入口、Renderer、生命周期、Canvas/DPR、shim 和音频是平台专用源码；旧射击模板代码已移除；Android `app/src/main/assets/js/js/` 是禁止进入发布包的路径。

## 稳定性规则

- 源文件和生成文件统一使用 UTF-8、LF、无 BOM。
- `npm run sync` 必须可重复执行；第二次执行应显示无差异。
- JS 同步工具不复制音频；微信轻量音频与 Android/Web 完整音频保持独立。交接包省略的 Android 重复镜像用 `node scripts/restore-android-audio.mjs` 恢复，再运行 `npm run verify:assets`。
- `npm run verify` 失败时先修复共享源或重新运行同步，再进行平台构建。

## 2026-10-14 表现层补充

`game/VisualTheme.js` 是第 12 个共享生成模块，拥有流光/纸感两套不可变视觉 tokens、主题身份回退和方块绘制色映射，不修改 coreConstants、分数或生成权重。独立主题偏好由共享 utils/storage.js 的 block_puzzle_theme_v1 键管理，旧设置及成绩存档键不变。修改源后仍使用 `npm run sync`；Renderer、LayoutMetrics、输入和平台生命周期继续保持平台独立。首页难度分段直接选中目标档位，结算页可直接返回主页；管理员资格和既有音频事件不变。

Renderer 按实例持有主题；切换时销毁旧 surface、渐变及局部重绘状态，棋盘缓存 key 包含主题。平台 InputManager 通过首页/设置入口调用切换和自身重绘回调，不改变 GameState 或重新应用音频设置。

## 2026-10-17 修复：生成失败兜底与平台契约守卫

- `shared/js/game/Piece.js`：`createRack` 在难度门槛拒绝全部候选、但棋盘仍存在可落点时，改用确定性保底候选组（单格 + line2 + l3）返回；该候选组仍满足当前难度的候选组硬约束（基础形状上限、easy 的 rescue/去重约束等），且必然包含可放的单格。只有棋盘确实没有空格时才返回失败。三端副本通过 `npm run sync` 生成，不手工编辑。
- `shared/js/utils/storage.js`：**不改变** v1.0.15 的启动主题规则（每次启动都从流光开始）；仅在注释中写明保存键不是启动恢复来源。
- 一致性守卫：`tests/fixtures/core-vectors.mjs` 的 `versions` 纳入 `web`（部署构建不再被 parity 跳过）；新增 `tests/parity/platform-defaults.test.mjs`（按规格固定各端默认授权策略，以及工具次数、拖拽参数、存档键、计分常量）与 `tests/parity/generation-failure-recovery.test.mjs`（seed=59 晚局真实落子触发补架后不得误判结束、保底候选组符合难度约束、满盘仍结束）。
