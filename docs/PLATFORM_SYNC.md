# 三端同步边界

## 当前关系

- 微信产品源码：`we xin xiao cheng xu/`
- 网页构建目录：`we xin xiao cheng xu-android-apk/docs/`
- Android WebView 资源目录：`we xin xiao cheng xu-android-apk/app/src/main/assets/`
- 共享源码：`shared/js/`
- 清单：`config/platform-manifest.json`

根目录不是 Git 工作树；只有 Android 子目录有独立 Git。同步和测试脚本位于根目录，Android 修改会显示在其现有 Git 工作树中。

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

共享基线：`Board.js`、`Piece.js`、`ScoreManager.js`、`utils/storage.js`、`coreConstants.js`、`DragModel.js`、`FrameInputQueue.js`、`SafeHitArea.js`、`RenderPerfStats.js` 和 `config/quality.js`。

平台独立：`GameState.js`、`InputManager.js`、`Renderer.js`、`LayoutMetrics.js`、`constants.js`、`main.js`、`render.js`、HTML、shim、Android Kotlin 和全部音频。上述平台层现在调用共享拖拽模型和输入队列，但仍保留各自的生命周期、Canvas/DPR 和 Renderer 适配。

目录状态：`shared/js/` 是共享源代码；三个目标目录中的带生成标记 JS 是生成副本；各端入口、Renderer、生命周期、Canvas/DPR、shim 和音频是平台专用源码；旧射击模板代码已移除；Android `app/src/main/assets/js/js/` 是禁止进入发布包的路径。

## 稳定性规则

- 源文件和生成文件统一使用 UTF-8、LF、无 BOM。
- `npm run sync` 必须可重复执行；第二次执行应显示无差异。
- 不复制音频；微信约 3.9 MB 的轻量音频与 Android/Web 完整音频保持独立。
- `npm run verify` 失败时先修复共享源或重新运行同步，再进行平台构建。
