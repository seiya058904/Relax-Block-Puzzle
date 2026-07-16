# 双版本自动化行为测试基线

日期：2026-06-15  
范围：微信小游戏与 Android APK 当前共同核心  
产品用语：面向用户统一使用“福利”；代码中的历史字段名暂不修改，以保护存档兼容。

## 1. 测试框架

本阶段使用 Node.js 内置 `node:test` 和 `node:assert/strict`，不安装 Vitest、Jest 或其他第三方包。

选择理由：

- 当前环境已有 Node.js `v24.15.0` 和 npm `11.12.1`。
- 两边核心代码使用 ES Module（`import/export`），Node 24 可直接加载。
- 零依赖，不影响微信开发者工具或 Android Gradle 构建。
- 测试只在共同工作区根目录运行，不写入两个项目的配置。
- 支持一条命令运行，并可顺序执行以避免全局平台 mock 相互干扰。

## 2. 执行命令

在共同工作区根目录运行：

```powershell
npm test
```

当前结果（2026-07-16，清理阶段）：共 `136` 项，`136` 项通过、`0` 项失败、`0` 项 TODO。包含 Android APK 嵌套旧副本和三端音频目录边界验证。

只运行双版本对照测试：

```powershell
npm run test:parity
```

测试命令使用 `--test-concurrency=1`，原因是现有代码通过全局 `wx` 和 `Math.random` 访问平台与随机数。顺序运行可以保证 mock 隔离和结果稳定。

## 3. 测试目录

```text
tests/
  fixtures/
    core-vectors.mjs          共享分数、道具和版本测试向量
  helpers/
    version-adapter.mjs       分别加载微信与 Android 真实模块
    platform-mocks.mjs        内存 Storage、随机数、时间和浏览器环境
  parity/
    module-loading.test.mjs   模块加载能力
    board.test.mjs            棋盘规则与双版本快照
    piece-generation.test.mjs 方块定义、难度、保底和固定随机序列
    score.test.mjs            计分、最高分和当前返回结构
    game-state.test.mjs       道具、撤回、组合、复活和结束状态
    storage.test.mjs          设置、最高分、迁移和 Android JSON 处理
```

所有核心行为使用同一组测试逻辑分别运行两个版本。`version-adapter.mjs` 只是路径和导入适配器，不复制游戏规则。

## 4. Mock 与隔离方式

### 4.1 随机数

测试期间临时替换 `Math.random`，使用明确的固定序列。回调完成后恢复原函数。方块测试不依赖大量随机运行。

### 4.2 当前时间

组合窗口测试临时替换 `Date.now`，精确验证 3 秒窗口。拖拽模型、输入队列和触摸结束清理已有共享行为测试；真机手感仍需人工验收。

### 4.3 平台存储

- 微信逻辑使用内存版 `wx.getStorageSync/setStorageSync`。
- Android 非法 JSON 测试加载真实 `browser-wx-shim.js`，使用内存 `localStorage` 和最小 DOM mock。
- 不读取或修改用户真实微信 Storage、WebView 数据或设备文件。

### 4.4 平台能力

本阶段不连接后端、不调用微信登录、不启动 WebView、不播放真实音频、不触发真机震动。测试辅助代码提供无副作用的平台占位能力；相关表现留待后续平台测试。

## 5. 当前自动覆盖

### 棋盘

- 空 10x10 棋盘。
- 合法放置、越界和重叠。
- 横线、竖线、交叉和多线识别/清除。
- 清除后的格子状态。
- 3x3 区域在边缘的裁剪。
- 无合法位置与仍有合法位置。
- 两版本相同操作后的棋盘快照一致。

### 方块与生成

- 两边 16 个基础形状标识一致。
- 每个旋转变体坐标为非负整数且类别有效。
- 三档难度权重与限制。
- 简单难度必须包含 rescue 类且不含 hard 类。
- 普通和大师难度禁止的 hard/蛇形组合。
- 自定义最大重试次数被严格执行。
- 固定随机序列下，两版本三档难度生成结果一致。

### 计分

- 1、3、5 格放置分。
- 1、2、3、4 线的清线分、奖励分和总增加分。
- 两版当前不同返回结构分别被记录。
- 相同输入的最终分数等价。
- 提高和未提高最高分。
- 管理员不可计分状态不写正式最高分。
- 组合状态和 clear/combo/combo3 事件数据。

### 道具、撤回、复活

- 三档初始道具次数和重开恢复。
- 刷新成功扣次数、零次数禁止和刷新后可放置保底。
- 清除指定区域、扣次数且不增加分数。
- 撤回恢复棋盘、候选、分数和业务状态；成功撤回扣减次数，同一快照不可重复使用。
- 撤回后清理拖动、预览、输入锁和临时反馈状态。
- 无复活时游戏结束。
- 福利复活保留分数、消耗次数并返回可玩候选。
- 复活失败进入游戏结束且保留分数。
- 管理员状态只存在于运行时，管理员分数不污染最高分。

### 存档

- 空值和错误数据类型回退默认值。
- 设置正常保存/加载和缺失字段补默认值。
- 三档最高分分别保存。
- 非数值最高分清洗。
- 旧单最高分迁移到普通难度。
- Android localStorage 非法 JSON 安全回退。
- 微信和 Android 逻辑存档对象等价。

## 6. 已发现的当前行为与差异

### 6.1 计分返回结构已统一

两个生产版本的 `applyPlacement()` 和 `applyLineClear()` 现在直接返回相同结构：

```js
{
  placementScore: 0,
  lineClearScore: 0,
  bonusScore: 0,
  totalAdded: 0,
  clearedLines: 0
}
```

- 所有字段始终存在且为有限数字。
- `totalAdded === placementScore + lineClearScore + bonusScore`。
- 放置、单线、双线、三线和四线向量均直接比较两个生产版本的返回对象。
- 微信清线提示已改为读取 `totalAdded`；提示文案和动画时长未改变。
- 计分公式、最终分数、最高分保存、管理员成绩隔离和存档格式未改变。

### 6.2 撤回次数缺陷已修复

两版旧逻辑在 `useUndoTool()` 中先增加 `toolUsage.undo`，随后又从放置前快照恢复旧 `toolUsage`，导致剩余撤回次数恢复为原值。

当前已修复为：恢复快照业务状态后，撤回使用量在快照基础上额外增加 1 次；`syncRoundRuntimeState()` 因此计算出正确的剩余次数。测试套件不再保留 TODO。

### 6.3 多余设置字段会被保留

当前 `loadSettings()` 使用对象展开合并，因此存档中的未知字段会出现在加载结果中。统一规格原本倾向忽略未知字段；改变该行为前需要兼容性决策和单独测试。

### 6.4 复活后的撤回语义已锁定

当前统一规则为：`consumeRevive()` 处理复活时清除旧 `undoSnapshot`。自动测试验证复活后不能使用复活前旧快照，避免把棋盘恢复到再次无路可走的状态。

### 6.5 用户用语

测试名称和本文使用“福利”。生产代码中的 `localMembershipEnabled` 等历史字段未改名，这是有意的存档兼容措施，不代表最终用户界面继续使用“会员”。

### 6.6 反馈事件与表现状态已统一

- 两边新增内容一致的 `FeedbackState.js`，统一清线得分、分数脉冲、新纪录和拖动阶段。
- 统一业务事件为 `piecePicked/piecePlaced/invalidPlacement/linesCleared/scoreChanged/highScoreBroken`。
- Android 已加入微信现有的清线提示、分数脉冲和本局首次新纪录提示。
- 微信已加入 Android 的 200ms 抬升、候选槽隐藏、成功收束和无效返回表现。
- 暂停时计时冻结；重开、返回首页、撤回和复活按契约清理。
- Android 调度测试确认空闲不持续请求帧，活跃反馈会唤醒帧循环，暂停时停止。

### 6.7 布局响应式测试已加入

- Android 首页布局测试覆盖 9 组逻辑视口，并分别验证管理员模式开启和关闭。
- Android 顶部 HUD 测试覆盖 9 组逻辑视口和 10 组分数，检查按钮、分数脉冲、最高分和安全区域不重叠。
- 微信顶部 HUD 测试覆盖菜单胶囊安全区、大分数和分数脉冲防重叠。
- Renderer 布局测试确认棋盘顶部位于拟合后的 HUD 下方。

## 7. 暂未覆盖

- Canvas 像素输出、布局截图、字体和安全区。
- 拖动手感、抬升动画、触摸结束坐标和真机输入。
- 真实音频播放、重叠、后台停止和 BGM 恢复。
- 真实震动。
- 微信登录、后端健康检查和管理员远程验证。
- Android Activity 返回键、WebView 生命周期和实际 localStorage 生命周期。
- 微信开发者工具、Android 模拟器和真机。
- 概率分布的统计检验；当前只验证冻结配置和确定性序列。

## 8. 下一阶段可安全修改的模块

计分返回结构、反馈事件、表现状态、布局响应式防重叠和撤回行为均已有自动化基线。下一阶段建议统一音效与震动触发规则，但继续保留平台音频接口和 Renderer 独立。

## 9. 测试失败定位方法

1. 先运行完整 `npm test`，查看失败测试名称中的版本前缀。
2. 若只有一个版本失败，检查 `tests/helpers/version-adapter.mjs` 指向的对应真实文件。
3. 棋盘失败查看 `Board.js`；生成失败查看 `Piece.js` 和固定随机序列。
4. 分数失败查看 `ScoreManager.js`，不要先改测试期望。
5. 道具、撤回、复活失败查看 `GameState.js` 对应方法和状态快照。
6. 存档失败先查看内存 Storage 快照；Android 非法 JSON 再查看 `browser-wx-shim.js`。
7. 若测试偶发失败，连续运行两次；确定性测试不应依赖真实时间或随机数。
8. 测试不得通过连接真实后端、清理用户存档或放宽断言来“修复”。

## 10. 构建说明

本次撤回修复测试包阶段已通过临时英文盘符映射完成 Android Debug 构建；项目真实路径仍包含中文，直接在原路径构建可能继续触发 Android Gradle Plugin 的中文路径检查。该规避方式只用于验证和出包，不修改业务代码或项目路径。

## v1.0.5 clear effect test baseline

Current expected automated baseline after this change:

- `npm test`: 136 tests, 136 passing, 0 failing, 0 TODO.
- The full test command must pass twice before reporting completion.
- New coverage includes clear effect event creation, row and column semantics, deterministic particles, phase transitions, expiry, bounded effect list size, pause timer behavior through existing update rules, and undo cleanup.
- `game-state.test.mjs` confirms a real clearing placement creates a clear effect and undo clears it without replaying it.
- Pixel-perfect Canvas output is still a manual verification item; automated tests assert semantic state and module behavior.
