# 微信小游戏与 Android APK 统一产品与技术规格

规格日期：2026-06-15  
依据：`docs/PARITY_AUDIT.md` 及两个项目当前代码  
适用范围：微信小游戏版本与 Android 私测 APK 版本

本文定义两个平台后续统一实现的唯一目标。实现人员不得再根据“哪个版本较新”自行选择行为；未明确列为平台差异的功能，最终行为必须一致。本规格不包含任何真实会员码、管理员验证码、AppID、密钥或凭据。

## 1. 统一目标与原则

1. 游戏规则、计分、难度、方块池、道具、复活、最高分资格和逻辑存档结构在两平台一致。
2. 视觉和声音反馈尽量一致，同时保留 Canvas、DPR、安全区、调度和生命周期的必要平台实现差异。
3. 现有用户最高分和设置必须兼容，不得因迁移而重置。
4. 纯规则不得直接调用 `wx`、WebView、DOM、Android Activity 或平台音频对象。
5. `shared/presentation` 只定义表现事件、状态、参数、文案和布局语义，不共享完整 Renderer。
6. 管理员能力与授权来源分离；管理员局永远不得写入正式最高分。
7. 每个迁移阶段必须可单独验证、提交和回滚，不进行一次性全量重写。

## 2. 已冻结的共同产品规则

以下规则已确定，不再作为迁移中的产品选择项。

### 2.1 棋盘与放置

- 棋盘固定为 `10 x 10`。
- 方块不得越界或覆盖已有格子。
- 每轮候选区包含 3 个方块；全部使用后生成下一组。
- 满行和满列在同一次检测中一起清除，交叉格只清除一次。
- 当前清线等待时间保持 `180ms`。

### 2.2 计分公式

- 放置基础分：`放置格数 * 10`。
- 清线分：`清除线数 * 100`。
- 奖励分：`清除线数 * 清除线数 * 50`。
- 本次总增加分：`放置基础分 + 清线分 + 奖励分`；放置和稍后完成的清线可以分两次产生计分结果，但一轮动作汇总必须可得到该总数。
- 清除道具不增加分数，不触发清线奖励。
- 不改变已有最高分数值含义。

### 2.3 难度与方块生成

- 难度保留 `easy`、`normal`、`master`。
- 方块定义、旋转变体、类别权重、普通难度拥挤修正、蛇形限制和候选组限制保持当前 `Piece.js` 行为。
- 生成候选组最多尝试 20 次，并保证至少一个当前方块可放置；失败返回明确失败结果。
- 刷新也使用相同保底逻辑，失败不扣次数、不替换原候选组、不结束游戏。

### 2.4 道具

| 难度 | 刷新 | 清除 | 撤回 |
|---|---:|---:|---:|
| 简单 | 3 | 1 | 1 |
| 普通 | 2 | 1 | 1 |
| 大师 | 1 | 0 | 1 |

- 清除范围为以点击格为中心、边界裁剪后的最多 `3 x 3` 区域。
- 撤回恢复最近一次成功放置前的局面，包括棋盘、分数、候选块、待清除、动画、刷新/清除使用量、复活量、组合状态和最高分资格；撤回使用量在快照基础上额外增加 1 次，因此成功撤回后剩余撤回次数扣减。
- 撤回不恢复拖动、预览、输入锁和临时反馈状态；这些状态在成功撤回后清理，避免把已结束的触摸输入带回当前局。
- 撤回不回滚已经写入的历史最高分。

### 2.5 复活与管理员能力

- 普通玩家每局 0 次复活；本地会员/福利开启后每局 2 次。
- 无路可走时，有复活次数则显示确认；接受后先尝试重抽，仍失败则随机清除最多 5 个已填格再重抽。
- 复活成功或失败处理时清除旧撤回快照，避免撤回到复活前的无路可走状态。
- 管理员模式提供无限道具和无限复活。
- 管理员局 `bestScoreEligible = false`，不得写入、覆盖或迁移为正式最高分。
- 管理员状态是运行时状态，不加入普通设置存档；重启应用后不得意外保持开启。

## 3. 统一计分结果契约

实施状态：**已完成（2026-06-15）**。所有计分入口统一返回以下结构。数值公式不变，只统一字段和调用方式。

```js
{
  placementScore: 0,       // 本次放置产生的基础分；无放置时为 0
  lineClearScore: 0,       // 本次清线基础分；无清线时为 0
  bonusScore: 0,           // 多线奖励分；无奖励时为 0
  totalAdded: 0,           // 本次调用实际增加的总分
  clearedLines: 0          // 本次清除的行数 + 列数
}
```

### 3.1 字段规则

- 所有字段必须始终存在，不用 `undefined` 表示未发生。
- 所有字段均为有限数字；没有对应得分时使用 `0`。
- `totalAdded === placementScore + lineClearScore + bonusScore`。
- `clearedLines` 为完成的行数与列数之和，与当前计分公式保持一致。
- 组合状态和最高分反馈仍由 `GameState` 管理，不放入 `ScoreManager` 返回对象。
- 管理员局继续通过 `bestScoreEligible = false` 阻止正式最高分写入。

### 3.2 调用方式

- `applyPlacement(state, cellCount)` 返回上述结构，其中只有 `placementScore` 和 `totalAdded` 非零。
- `applyLineClear(state, lineCount)` 返回上述结构，其中 `lineClearScore`、`bonusScore`、`totalAdded` 和 `clearedLines` 按公式填写。
- GameState 负责把计分结果转成反馈事件；ScoreManager 不直接播放音效、震动或绘制。
- 为保持当前延迟清除流程，放置与清线可以生成两个 `scoreChanged` 事件。

### 3.3 验收标准

- 1 格放置增加 10 分，5 格放置增加 50 分。
- 1 线增加 150 分，2 线增加 400 分，3 线增加 750 分。
- 迁移前后相同操作序列的最终分数完全相同。
- 两平台对相同输入返回字段和值完全相同。

## 4. 统一反馈事件与表现状态

事件名采用 `camelCase`。事件是一次发生的事实；表现状态是可持续绘制并随时间更新的状态。

### 4.1 事件公共字段

```js
{
  type: 'piecePicked',
  timestamp: 0,        // 单调运行时毫秒；只用于表现，不写存档
  source: 'gameplay',  // gameplay | ui | tool | lifecycle
  payload: {}
}
```

事件队列由 GameState/应用编排层产生和消费。平台适配器不得改变事件的业务含义。

### 4.2 事件决策表

| 事件 | 触发条件 | 主要数据 | 表现时长 | 音效 | 震动 | 暂停规则 | 清理规则 |
|---|---|---|---:|---|---|---|---|
| `piecePicked` | 成功开始拖动一个未使用方块 | `pieceId/index/cells/color/originRect/displayCellSize` | 抬升 `200ms` | `pickup` | 无 | 前台游戏暂停时冻结；应用后台立即取消拖动 | touch cancel、页面切换、重开时清理 |
| `piecePlaced` | 方块成功写入棋盘 | `pieceId/row/col/cellCount/scoreResult` | 放置脉冲 `140ms` | `place` | 短震动 | 游戏暂停时冻结动画 | 完成后自动清理；重开立即清理 |
| `invalidPlacement` | 拖动结束但位置不可放置，或无效操作 | `reason/pieceId?/row?/col?` | 可选轻提示 `<=600ms` | `invalid`（现有 click 资源） | 短震动 | 暂停时不产生 | 页面切换或新操作清理 |
| `linesCleared` | 清线等待完成并实际清除 | `rows/cols/lineCount/scoreResult` | 清线高亮 `180ms`；文字 `900ms` | `clear`，组合时另触发组合音效 | 短震动一次 | 游戏暂停时冻结倒计时 | 页面切换、重开、结束时清理 |
| `scoreChanged` | 任意合法计分调用使总分增加 | 完整统一计分结果、`scoreBefore/scoreAfter` | 分数脉冲 `500ms` | 无独立音效 | 无 | 游戏暂停时冻结 | 新脉冲可重置持续时间；重开清理 |
| `highScoreBroken` | 正式可计分局首次超过开局最高分 | `previous/current/difficulty` | `1200ms` | 不新增专用资源 | 无 | 游戏暂停时冻结 | 每局只触发一次；重开清理 |
| `comboTriggered` | 3 秒组合窗口内再次清线 | `count/tier/lineCount` | 与清线文字同步 `900ms` | `combo` 或 `combo3` | 短震动一次；不得与 clear 重复震两次 | 游戏暂停时冻结组合窗口 | 超过窗口归零；重开/复活重置 |
| `itemUsed` | 刷新、清除或撤回成功 | `item/remaining/resultSummary` | 通知 `1200ms` | `click`；清除可使用 `clear`，但同动作只播放一次 | 成功时短震动一次 | 暂停/弹层阻止使用 | 新通知覆盖旧通知；重开清理 |
| `reviveStarted` | 玩家确认使用复活或管理员自动续局 | `remainingBefore/isAdmin` | 通知 `1200ms` | `click` | 短震动一次 | 复活处理期间锁定输入 | 成功或失败结束后清理中间状态 |
| `reviveCompleted` | 重抽成功并恢复可玩状态 | `remainingAfter/clearedCells/rack` | 放置脉冲可用于被移除格 `140ms` | `clear`（仅实际移除格时） | 不额外震动 | 不适用 | 正常自动清理 |
| `gameOver` | 无合法移动且无法/拒绝复活 | `score/bestScore/difficulty/bestScoreEligible/reviveUsed` | 页面持续 | `gameover` | 无 | 后台不重复触发 | 重开或返回首页清理 |
| `uiClicked` | 按钮被有效点击 | `action` | 无 | `click` | 默认无 | 后台不产生 | 立即消费 |
| `appBackgrounded` | 平台进入后台 | 无敏感数据 | 无 | 停止全部效果音和 BGM | 无 | 冻结所有表现计时器 | 取消拖动，保留可恢复页面状态 |
| `appForegrounded` | 平台返回前台 | `resumeBgm` | 无 | 仅按设置恢复 BGM，不重播旧效果音 | 无 | 恢复表现计时器 | 请求完整重绘一次 |

### 4.3 表现状态

统一表现状态至少包含：

```js
{
  dragLift: { active, pieceId, elapsed, duration, from, to, scaleFrom, scaleTo },
  placementPulses: [{ row, col, remaining, duration }],
  clearHighlight: { rows, cols, remaining, duration },
  scorePulse: { remaining, duration },
  scoreMessage: { text, deltaScore, lineCount, remaining, duration },
  recordMessage: { previous, current, remaining, duration },
  notice: { textKey, params, remaining, duration }
}
```

统一默认参数：拖动抬升 `200ms`、放置脉冲 `140ms`、清线 `180ms`、清线得分文字 `900ms`、总分脉冲 `500ms`、新纪录 `1200ms`、普通通知 `1200ms`。

### 4.4 暂停和清理总则

- 游戏内暂停或设置弹层打开时，表现倒计时冻结，不继续消耗时间。
- 应用进入后台时取消正在拖动的方块，冻结其余可恢复表现状态，停止全部声音。
- 返回首页、重新开始、游戏结束时清除拖动、预览、待清线、脉冲、临时通知和一次性反馈队列。
- 重开保留用户设置和历史最高分，不保留管理员开启状态以外的局内状态；管理员状态是否继续本次运行由现有关闭入口控制，但不得写存档。

## 5. Renderer 与 presentation 边界

### 5.1 可以共享

- 第 4 节定义的反馈事件、载荷和表现状态。
- 动画持续时间、缩放目标、颜色语义和资源逻辑名称。
- 页面语义：home、help、playing、gameover；settings、pause、membership、admin、revive 等弹层。
- 布局语义：safeTop、header、board、tools、rack、bottomInset、modal。
- 文案键和参数，不在平台 Renderer 中复制业务判断。
- 命中区域的语义动作名称，例如 `startGame`、`openSettings`、`useRefresh`。

### 5.2 必须平台独立

- Canvas 的创建、上下文、渐变、字体和实际绘制代码。
- DPR、像素上限、缩放和画布尺寸。
- 微信菜单按钮、安全区和设备信息。
- Android DPR 限制、WebView 尺寸和系统栏处理。
- requestAnimationFrame、按需渲染、脏标记和 WebView 定时器暂停。
- 微信 `wx` 生命周期与 Android Activity/WebView 生命周期。
- DOM 输入框、微信键盘、Android 自绘键盘。

### 5.3 统一首页视觉规格

Android 当前首页作为视觉基础：标题、装饰线、难度选择、独立最高分卡片、主开始按钮、帮助和设置次级按钮。微信实现必须：

- 将顶部起点放在菜单按钮/安全区下方。
- 不以固定像素假设屏幕高度；紧凑屏幕降低间距和字号，但不隐藏功能。
- 保持最高分、难度和开始按钮的视觉优先级。
- 所有按钮命中区域不得小于当前可用实现，且不得重叠。
- 使用平台 Renderer 单独计算布局，不能复制 Android 绝对坐标。

## 6. 音频与震动统一规格

### 6.1 触发规则

| 动作 | 音效 | 震动 | 备注 |
|---|---|---|---|
| 拾取 | `pickup` | 无 | 两平台启用 |
| 成功放置 | `place` | 短震动 | 每次成功放置一次 |
| 无效放置/无效操作 | `invalid`（映射现有 click） | 短震动 | 不与普通点击重复播放 |
| 清线 | `clear` | 短震动 | 一次动作只播放一次 clear |
| 连击 | `combo` 或 `combo3` | 不额外震动 | 可与 clear 连续播放，但不得开启多个同名实例 |
| 刷新成功 | `click` | 短震动 | 失败使用 invalid |
| 清除道具成功 | `clear` | 短震动 | 不再叠加 click |
| 撤回成功 | `click` | 短震动 | 失败使用 invalid |
| UI 按钮 | `click` | 无 | 进入后台前最后一次点击也可播放，后台后禁止新播放 |
| 游戏结束 | `gameover` | 无 | 每局一次 |

### 6.2 重叠和实例策略

- 同一逻辑音效默认不允许重叠；再次触发时停止旧实例、归零并重播。
- 不同音效允许按事件顺序播放，例如 `clear` 后播放 `combo`，但适配器可因平台限制做降级。
- 页面进入后台时停止全部效果音和 BGM，不记录效果音播放位置。
- 返回前台不重播任何旧效果音；仅当 `bgmEnabled` 为真时从曲目开头恢复 BGM。
- 切换 BGM 曲目时销毁或停止旧曲目上下文，再播放新曲目。
- 音频初始化或播放失败不得阻止游戏；适配器返回失败并最多记录一次安全警告。

### 6.3 设置规则

- `soundEnabled = false`：禁止全部效果音，但不改变震动设置。
- `bgmEnabled = false`：停止 BGM，不影响效果音。
- `vibrationEnabled = false`：禁止所有游戏震动。
- 设置关闭后必须立即生效；不得等待下一局。
- 平台不支持震动时静默降级，不显示错误弹窗。

## 7. 存档兼容规格

### 7.1 现有键和字段

必须继续识别并写入现有设置键、分难度最高分键和旧单最高分键。具体键值沿用代码，不在本规格复制敏感或环境配置。

设置逻辑字段保持：

```js
{
  soundEnabled: true,
  bgmEnabled: false,
  vibrationEnabled: true,
  bgmTrack: 2,
  difficulty: 'normal',
  localMembershipEnabled: false
}
```

最高分逻辑字段保持：

```js
{ easy: 0, normal: 0, master: 0 }
```

### 7.2 兼容规则

- 不删除、不改名现有字段；新增字段必须有安全默认值。
- 缺失设置字段按默认值补齐，未知字段读取时忽略、保存时不承诺保留。
- 难度非法时回退 `normal`；最高分非有限数值时回退 0。
- 新最高分对象不存在时，把旧单最高分迁移到 `normal`，其他难度为 0。
- 迁移必须幂等：重复读取不会重复增加或损坏数据。
- 非法 JSON、非对象设置或存储异常均回退安全默认值，游戏继续运行。
- 存储失败不能让游戏崩溃；最高分可在本次内存中显示，但应记录可诊断的非敏感错误。
- 管理员模式、管理员授权、输入中的码和局内临时状态不写入普通设置。
- 管理员局不得调用正式最高分保存操作。

### 7.3 平台适配

- 微信使用微信 Storage 适配器。
- Android 使用 WebView localStorage 适配器；未来替换为原生存储时仍必须遵守相同逻辑结构和迁移规则。
- 两平台逻辑结构相同，但不要求自动跨平台同步。
- 存储适配器只负责读写原始值；默认值、清洗和迁移放在共享数据层。

## 8. 差异决策总表

优先级：P0 为规则/数据基线，P1 为核心一致性，P2 为体验统一，P3 为清理与优化。

| 功能或差异名称 | 微信版当前行为 | Android 版当前行为 | 最终统一行为 | 采用方案 | 决策理由 | 涉及文件和函数 | 是否影响存档兼容 | 是否需要平台人工验证 | 实施优先级 | 验收标准 |
|---|---|---|---|---|---|---|---|---|---|---|
| 启动链 | 初始化云与持续帧循环 | Activity/WebView/网页启动 | 各自启动，向同一游戏初始化接口提供平台能力 | 保留平台差异 | 平台入口无法共用 | 两边 `game.js/Main`; Android `MainActivity/index.html` | 否 | 是 | P1 | 两边进入相同首页状态，平台失败不阻止本地游戏 |
| 首页布局 | 基础布局，含微信安全区 | 更精细的卡片和高光布局 | Android 信息层级为基础，平台单独计算坐标 | 融合方案 | 保留 Android 优点并避免微信遮挡 | 两边 `Renderer.drawHome/buildLayout` | 否 | 是 | P2 | 小屏、长屏、安全区下无重叠且功能齐全 |
| 帮助页 | 当前规则文案 | 基本相同 | 共享文案键和内容，平台绘制独立 | 融合方案 | 防止规则文案漂移 | `openHelp/closeHelp/drawHelp` | 否 | 是 | P2 | 两边文案与统一规则一致 |
| 页面状态 | 相同页面与弹层集合 | 相同 | 共享状态转换和清理规则 | 融合方案 | 状态一致可测试 | `GameState.setScreen/createUiState` | 否 | 否 | P1 | 同一动作序列产生同一页面状态 |
| 棋盘规则 | 当前 Board | 字节相同 | 完全保持 | 融合方案 | 已证明一致 | 两边 `Board.js` | 否 | 否 | P0 | 规则基线测试全部相同 |
| 方块池与难度 | 当前 Piece | 字节相同 | 完全保持 | 融合方案 | 不改变平衡 | 两边 `Piece.js` | 否 | 否 | P0 | 固定随机源下序列一致 |
| 生成保底 | 最多 20 次 | 相同 | 完全保持 | 融合方案 | 防止无解候选组 | `createRack` | 否 | 否 | P0 | 成功组至少一块可放；失败协议一致 |
| 计分公式 | 当前公式 | 相同 | 数值不变 | 融合方案 | 保持历史成绩可比 | `ScoreManager` | 否 | 否 | P0 | 基准分数全部不变 |
| 计分返回结构 | 已统一 | 已统一 | 采用第 3 节统一结构；已于 2026-06-15 实施 | 融合方案 | 支持统一反馈和测试 | `applyPlacement/applyLineClear/syncBestScore` | 否 | 否 | 已完成 | 两平台对象字段和值一致 |
| 最高分 | 按难度实时保存 | 相同 | 保持；管理员局排除 | 融合方案 | 保护正式成绩 | `syncBestScore/storage.js` | 是，必须兼容 | 是 | P0 | 旧分数不丢、三难度隔离 |
| 消除得分提示 | 有 | 无 | 两边有，900ms | 采用微信方案 | 奖励感知更明确 | `GameState scoreFeedback`; 两边 Renderer | 否 | 是 | P2 | 清线显示线数与本次增分 |
| 总分脉冲 | 有，500ms | 无 | 两边有，500ms | 采用微信方案 | 增强计分可读性 | `scoreChanged`; Renderer 头部 | 否 | 是 | P2 | 每次分数增加触发且不影响布局 |
| 新纪录提示 | 有，1200ms | 无 | 两边有，每局一次 | 采用微信方案 | 统一奖励反馈 | `checkNewRecord`; Renderer | 否 | 是 | P2 | 仅正式计分局首次突破触发 |
| 拖动抬升 | 无 | 约 200ms 抬升缩放 | 两边有；表现参数共享、坐标适配 | 采用 Android 方案 | 减少遮挡并提升手感 | `startDrag/moveDrag/drawDraggedPiece` | 否 | 是 | P2 | 无双块，动画后落点准确 |
| 拖动偏移参数 | 70-90、系数 1.5 | 48-72、系数 1.2 | 视觉目标一致，数值允许按平台配置 | 保留平台差异 | 屏幕/触摸环境不同 | `constants.js/getDragFingerOffsetY` | 否 | 是 | P2 | 主流真机手指不遮挡且不越屏 |
| touchend 最终坐标 | 不二次更新 | 二次更新 | 两边二次更新 | 采用 Android 方案 | 提高快速拖放准确性 | `InputManager.handleTouchEnd` | 否 | 是 | P1 | 快速拖放使用抬手最终坐标 |
| 拖动槽原块 | 可能保留显示 | 拖动时隐藏 | 两边隐藏 | 采用 Android 方案 | 消除双块视觉 | `Renderer.drawRackPieces` | 否 | 是 | P2 | 拖动期间仅显示一个活动方块 |
| 刷新/清除/撤回 | 撤回次数旧逻辑会被快照抵消；已修复 | 相同缺陷；已修复 | 刷新/清除规则保持；撤回成功扣 1 次，快照只恢复业务状态并清理输入状态 | 融合方案 | 修正双版本共同缺陷，不改变道具数量和计分 | `GameState.useRefreshTool/useClearTool/useUndoTool/createUndoSnapshot`、`Board.clearArea` | 否 | 否 | 已完成 | 次数、成功/失败、回滚行为和输入清理测试全部通过 |
| 组合窗口 | 3 秒 | 相同 | 保持 3 秒，统一事件 | 融合方案 | 不改变现有反馈节奏 | `comboState/handleLineClear` | 否 | 是 | P1 | 暂停冻结，超时归零 |
| 会员/福利规则 | 会员，每局 2 次复活 | 福利，规则相同 | 规则保持，内部字段暂沿用 | 融合方案 | 避免存档字段改名 | `submitMembershipCode/getRoundReviveAllowance` | 是，字段不改 | 是 | P1 | 旧开启状态继续有效 |
| 会员/福利命名 | “会员” | “福利” | 规格暂用“会员/福利”，发布文案待用户决定 | 保留待决策 | 代码无法决定产品命名 | 两边 Renderer 文案 | 否 | 是 | P3 | 最终发布前全局文案一致 |
| 复活 | 当前流程，旧逻辑不主动清理撤回快照；已修复 | 相同；已修复 | 复活次数和重抽规则保持；复活处理清除旧撤回快照 | 融合方案 | 防止复活后撤回到死局，不改变复活次数和分数 | `handleNoMoves/consumeRevive` | 否 | 否 | 已完成 | 有/无次数、清 5 格路径和复活后不可用旧撤回均通过 |
| 微信管理员授权 | 后端验证 | 无 | 微信正式环境继续服务端验证 | 采用微信方案 | 符合正式运营标准 | `AuthClient/submitAdminCode` | 否 | 是 | P1 | 后端失败不阻止普通游戏 |
| Android 管理员授权 | 不适用 | 私测本地开启 | 私测可本地开启；正式发布前重新评估 | 保留平台差异 | 当前产品场景明确 | Android `submitAdminCode` | 禁止持久化 | 是 | P1 | 重启不保持，成绩不写最高分 |
| 设置结构 | 当前 6 字段 | 相同 | 保持字段和默认值 | 融合方案 | 保证存档兼容 | 两边 `storage.js` | 是 | 是 | P0 | 旧设置无损加载，缺字段补默认 |
| 存储介质 | 微信 Storage | localStorage | 共享逻辑结构，适配器独立 | 保留平台差异 | 平台能力不同 | `storage.js/browser-wx-shim.js` | 是 | 是 | P1 | 损坏数据安全回退，升级不清空 |
| 拾取音效 | 播放 | 禁用 | 两边播放 | 采用微信方案 | 已有相同资源 | `SoundManager.playPickup` | 否 | 是 | P2 | 每次有效拾取一次，后台不播放 |
| 效果音重叠 | 同名先 stop/seek | 同样，但后台额外 stopAll | 采用第 6 节统一策略 | 采用 Android 方案 | 防止残留和重叠 | `SoundManager.playEffect/stopAllEffects` | 否 | 是 | P1 | 同名不叠加，后台无残音 |
| 前后台处理 | 停 BGM，持续循环 | 停全部声音、暂停定时器 | 状态语义一致，平台生命周期独立 | 采用 Android 方案 + 保留平台差异 | Android 行为更完整 | 两边 Main/SoundManager；Activity | 否 | 是 | P1 | 后台无音频/输入，前台完整重绘 |
| 震动 | `wx.vibrateShort` | navigator vibration | 同一事件规则，适配器独立 | 保留平台差异 | API 不同 | `triggerVibration/shim` | 否 | 是 | P2 | 设置关闭后零震动，不支持时不报错 |
| 渲染调度 | 持续 RAF | 按需渲染 | 两边目标采用失效重绘；实现可分平台渐进接入 | 采用 Android 方案 | 降低无效消耗 | 两边 `Main.loop`; Android scheduler | 否 | 是 | P2 | 静止时不持续重绘，动画无丢帧 |
| DPR | 原始微信 DPR | 上限和像素限制 | 微信按安全能力；Android保留限制 | 保留平台差异 | 性能与清晰度权衡不同 | 两边 `render.js`; shim | 否 | 是 | P1 | 无超大画布、无明显模糊或裁切 |
| 安全区 | 微信菜单按钮 | 无微信菜单 | 微信独立适配；Android使用系统可用区 | 保留平台差异 | 平台 UI 不同 | `screenMetrics/Renderer layout` | 否 | 是 | P1 | 所有控件位于可点击可见区域 |
| 福利码键盘 | 微信系统键盘 | 自绘 + HTML 输入兼容 | 各平台保留当前输入方案，共享提交规则 | 保留平台差异 | Android 已解决输入兼容 | InputManager/Renderer/shim | 否 | 是 | P2 | 输入、删除、确认、取消均可靠 |
| Android 返回键 | 无 | 默认 WebView/退出 | 暂定保留现状，列为发布前决策 | 保留平台差异 | 用户未指定目标 | `MainActivity.onBackPressed` | 否 | 是 | P3 | 当前不破坏；正式版前确认产品行为 |
| 启动错误页 | 无专用页 | 有 bootError | Android 保留；微信使用平台安全日志，不要求复制 UI | 保留平台差异 | 启动环境不同 | `index.html`; 微信启动链 | 否 | 是 | P3 | Android 错误可见且不泄露敏感信息 |
| 遗留模板代码/资源 | 微信存在 | Android 已较少 | 迁移最后确认无引用后逐个处理 | 融合方案 | 先验证再清理 | 微信模板目录和旧音频 | 否 | 否 | P3 | 静态调用图、构建和回归均证明无引用 |

## 9. 推荐架构（本轮不创建）

```text
shared/core/
  board.js
  pieces.js
  scoring.js
  game-state.js
  tools.js
  revive.js

shared/presentation/
  events.js
  presentation-state.js
  animation-constants.js
  copy.js
  layout-semantics.js

shared/data/
  settings-schema.js
  best-score-schema.js
  migrations.js

platform/wechat/
  bootstrap.js
  renderer.js
  adapters/*

platform/android/
  bootstrap.js
  renderer.js
  adapters/*
  MainActivity.kt

tests/
  core/*
  presentation/*
  contracts/*
```

`shared/core` 不依赖 `shared/presentation` 或平台层。`shared/presentation` 可以依赖核心输出的数据结构，但不持有 Canvas。平台 Renderer 读取共享表现状态并负责绘制。

## 10. 平台接口规格

所有接口失败均应返回可判断结果或安全默认值，不抛出导致游戏退出的未处理异常。

### 10.1 storage

```js
get(key) -> { ok, value, errorCode? }
set(key, value) -> { ok, errorCode? }
remove(key) -> { ok, errorCode? }
```

- 输入：非空字符串键、可序列化值。
- 输出不得包含平台原始异常对象或敏感内容。
- `get` 失败时共享数据层使用默认值；`set` 失败时保留内存状态并继续游戏。

### 10.2 audio

```js
playEffect(id, { restart = true } = {}) -> { ok }
playBgm(trackId) -> { ok }
stopEffect(id) -> { ok }
stopAllEffects() -> { ok }
stopBgm() -> { ok }
setSuspended(suspended) -> { ok }
```

- 未知资源、自动播放限制或上下文失败时返回 `ok:false`，不得中断状态更新。
- `setSuspended(true)` 必须停止全部音频；恢复时不重放效果音。

### 10.3 vibration

```js
isSupported() -> boolean
vibrate(kind) -> { ok }
```

- `kind` 首期只需 `short`。
- 不支持或用户关闭时返回 `ok:false` 并静默降级。

### 10.4 lifecycle

```js
onBackground(handler) -> unsubscribe
onForeground(handler) -> unsubscribe
getState() -> 'foreground' | 'background'
```

- 重复平台通知必须去重，确保一次实际切换只触发一次业务处理。
- handler 异常不得阻止其他订阅者。

### 10.5 authentication

```js
getCapabilities() -> { login, remoteAdminVerification, localTestAdmin }
login() -> { ok, loggedIn, userId?, isMember?, errorCode? }
healthCheck() -> { ok, healthy }
verifyAdmin(input) -> { ok, allowed, mode: 'remote' | 'local-test' }
```

- Android 离线适配器的 `login` 返回可降级结果，不伪装成正式登录。
- `verifyAdmin` 不向共享核心暴露真实凭据，也不记录输入。
- 微信后端失败不能阻止普通本地游戏。

### 10.6 keyboard

```js
open({ initialValue, maxLength, inputMode }) -> { ok }
close() -> { ok }
onInput(handler) -> unsubscribe
onConfirm(handler) -> unsubscribe
onComplete(handler) -> unsubscribe
```

- 共享层只处理规范化后的文本。
- 平台适配器负责系统键盘、自绘键盘、DOM 输入和焦点问题。

### 10.7 screenMetrics

```js
getMetrics() -> {
  width, height,
  devicePixelRatio,
  renderPixelRatio,
  safeInsets: { top, right, bottom, left },
  menuButtonRect: object | null
}
onChange(handler) -> unsubscribe
```

- 所有数值使用 CSS/逻辑像素，Renderer 再使用 `renderPixelRatio` 映射画布像素。
- 缺少安全区时回退 0；DPR 异常时回退 1。

### 10.8 scheduler

```js
invalidate(reason) -> void
requestAnimation(handler) -> token
cancelAnimation(token) -> void
suspend() -> void
resume() -> void
isSuspended() -> boolean
```

- 有活动动画或脏状态时调度帧；静止且无失效请求时不持续重绘。
- `resume()` 后强制完整重绘一次。
- 微信可先用兼容实现，再逐步切到按需渲染；行为契约保持一致。

## 11. 分阶段迁移计划

### 阶段 1：建立自动化行为基线

- **修改范围**：新增独立测试运行入口、测试夹具和必要的无副作用导出；优先测试 Board、Piece、Score、storage 清洗、道具、撤回和复活。
- **不应修改**：游戏数值、Renderer、资源、平台启动链、存档键。
- **前置条件**：确认测试工具不会要求业务代码迁移目录；固定随机源设计完成。
- **自动验证**：同一测试集分别加载微信和 Android 当前模块，比较结果快照。
- **人工验证**：无，仅确认测试命令可由初学者重复执行。
- **完成标准**：第 22 节审计建议中的核心测试全部通过，两版本差异均有明确白名单。
- **回滚方式**：移除新增测试文件和测试专用导出，不触碰存档或资源。

### 阶段 2：统一计分返回结构

**实施状态：已完成（2026-06-15）。**

- **修改范围**：两边 `ScoreManager.js`、`GameState` 中计分调用与测试。
- **不应修改**：公式、最高分键、Renderer 视觉、难度和道具。
- **前置条件**：阶段 1 计分基线通过。
- **自动验证**：公式、返回字段、管理员资格、最高分更新测试。
- **人工验证**：两边完成一次放置、单线和多线消除，最终分数不变。
- **完成标准**：两边返回第 3 节结构，所有旧分数断言保持。
- **回滚方式**：恢复旧返回适配器；不回滚用户数据。

### 阶段 3：统一反馈事件和表现状态

**实施状态：已完成（2026-06-15）。** 事件、瞬时状态、暂停冻结、清理规则和双版本测试见 `docs/FEEDBACK_CONTRACT.md`。

- **修改范围**：GameState 事件、Main 消费、presentation 状态和测试。
- **不应修改**：Canvas 绘制细节、平台 API、资源文件。
- **前置条件**：计分结构稳定。
- **自动验证**：每个动作的事件顺序、载荷、暂停冻结和页面清理。
- **人工验证**：调试日志只检查事件名，不打印敏感输入。
- **完成标准**：两平台相同动作产生相同领域事件；平台差异只在消费端。
- **回滚方式**：保留旧事件名到新事件的临时映射，按平台回退消费者。

### 阶段 4：合并得分反馈和拖动动画

**实施状态：已完成（2026-06-15）。** Android 已接入清线得分、总分脉冲和新纪录提示；微信已接入拖动抬升、候选槽隐藏、成功收束、无效返回和 touchend 最终坐标同步。两边 Renderer 仍独立。

- **修改范围**：两边 GameState 表现状态、Renderer 消费；微信加入拖动抬升，Android 加入得分反馈。
- **不应修改**：规则、计分数值、DPR、安全区和调度实现。
- **前置条件**：阶段 3 事件契约稳定。
- **自动验证**：动画状态持续时间、清理和暂停测试。
- **人工验证**：微信与 Android 小屏/长屏拖动、清线、新纪录、无双块。
- **完成标准**：反馈语义和时长一致，落点准确，无 UI 重叠。
- **回滚方式**：按反馈功能开关禁用新表现，不回滚核心事件。

### 阶段 5：统一音效与震动规则

- **修改范围**：SoundManager、Main 事件映射、audio/vibration 适配器。
- **不应修改**：音频文件内容、计分、页面布局。
- **前置条件**：反馈事件稳定。
- **自动验证**：用假适配器断言调用次数、顺序、设置开关和后台停止。
- **人工验证**：两平台逐音效、连击、静音、震动和快速重复操作。
- **完成标准**：第 6 节规则全部满足，Android 拾取音效启用，无残留重叠。
- **回滚方式**：恢复旧音频消费者，但保留事件契约。

### 阶段 6：接入生命周期和渲染调度

- **修改范围**：Main、scheduler/lifecycle 适配器、Android Activity bridge、微信生命周期绑定。
- **不应修改**：游戏规则、存档结构、Renderer 画面设计。
- **前置条件**：动画和音频已可暂停/恢复。
- **自动验证**：假生命周期下的冻结、取消拖动、恢复重绘和事件去重。
- **人工验证**：微信/Android 前后台、锁屏、最近任务、长时间暂停。
- **完成标准**：后台无输入/声音/时间流逝，前台状态正确且完整重绘。
- **回滚方式**：平台独立回退到原调度；共享状态不需回滚。

### 阶段 7：统一存档兼容逻辑

- **修改范围**：共享数据清洗/迁移、两平台 storage 适配器、测试。
- **不应修改**：现有键、现有字段含义、用户真实数据、管理员策略。
- **前置条件**：备份测试夹具包含旧键、缺字段和损坏值。
- **自动验证**：默认值、缺字段、非法 JSON、旧单分迁移、幂等和写失败。
- **人工验证**：两平台升级安装前后最高分与设置保持。
- **完成标准**：所有兼容夹具通过，无用户数据重置。
- **回滚方式**：保留旧读取路径作为回退；不执行破坏性反向迁移。

### 阶段 8：统一首页与平台布局适配

- **修改范围**：两边 Renderer 首页布局、共享文案/语义、screenMetrics 适配器。
- **不应修改**：游戏核心、存档、Android DPR 策略、微信安全区来源。
- **前置条件**：屏幕指标接口稳定，目标截图/尺寸矩阵确定。
- **自动验证**：布局矩形不越界、不重叠、最小命中尺寸。
- **人工验证**：微信菜单按钮、多尺寸模拟器、Android 刘海/系统栏和字体。
- **完成标准**：信息层级一致，平台遮挡为零。
- **回滚方式**：平台 Renderer 独立恢复旧首页布局。

### 阶段 9：清理确认无用的重复代码

- **修改范围**：仅经调用图、构建、测试和人工验证确认无用的文件；每个文件单独评审和删除。
- **不应修改**：任何未确认用途的资源、用户素材、发布文件、存档兼容代码。
- **前置条件**：双平台完整回归通过，资源清单建立。
- **自动验证**：静态 import 图、资源引用图、构建和全部测试。
- **人工验证**：启动到结束全流程，无缺图缺音。
- **完成标准**：每个清理项有证据和独立提交。
- **回滚方式**：逐文件恢复对应提交；禁止批量递归删除。

### 阶段 10：双平台回归验证

- **修改范围**：仅修复回归发现的问题和补测试。
- **不应修改**：未经规格批准的新功能、数值和平衡。
- **前置条件**：阶段 1-9 的适用项完成。
- **自动验证**：核心、事件、接口、存档、资源哈希和构建全部通过。
- **人工验证**：微信开发者工具、微信真机、Android 模拟器、至少两类 Android 真机。
- **完成标准**：决策表每项验收通过，剩余平台差异均在白名单。
- **回滚方式**：按阶段提交回退，不回滚已兼容读取的存档逻辑。

## 12. 已确定的统一决策

- 保持全部现有核心数值和规则。
- 采用统一计分结果结构，不改变分数。
- 两平台统一拥有拾取音效、清线得分提示、总分脉冲和新纪录提示。
- 两平台统一采用拖动抬升、隐藏候选槽原块和 touchend 最终坐标同步。
- 首页以 Android 信息层级为基础，平台布局独立。
- 同名音效不重叠，后台停止全部音效和 BGM，前台只恢复已开启的 BGM。
- 表现事件、状态和参数可共享；完整 Renderer 不直接共享。
- 现有存档键、字段、默认值、旧最高分迁移和管理员成绩排除保持。
- Android 私测可本地开启管理员模式，但不持久化、不污染最高分。

## 13. 暂时保留的平台差异

- 微信登录、健康检查、CloudBase/后端和服务端管理员验证。
- Android 离线运行与私测本地管理员授权。
- 微信 Storage 与 Android WebView localStorage。
- 微信生命周期与 Android Activity/WebView 生命周期。
- 微信菜单按钮安全区和 Android 系统可用区。
- Android DPR/画布像素限制。
- Android 自绘福利码键盘与微信系统键盘。
- 平台音频、震动、Canvas、调度和后台控制实现。
- 拖动偏移的具体数值可按平台真机调校，但视觉目标相同。

## 14. 仍需用户决定的问题

1. 发布文案最终统一使用“会员”还是“福利”。在决定前不改现有存档字段名。
2. Android 系统返回键最终行为：直接退出、先打开暂停菜单，还是游戏中二次确认。
3. Android 若未来公开发布，管理员入口采用移除、构建开关还是远程验证。
4. 微信是否在性能验证后也全面切换按需渲染；规格目标支持，但应以实测决定上线时点。

这些问题不阻止第一阶段自动化基线实施。

## 15. 第一阶段实施建议

首先实施“自动化行为基线”，不要先移动目录或合并 Renderer。原因是当前规则虽高度一致，但没有自动测试保护；直接抽取共享代码会让后续无法证明数值和存档没有变化。

### 15.1 第一阶段预计修改的文件

具体测试工具需在实施前确认，但预计范围应限制为：

- 新增工作区级 `tests/` 测试文件与最小测试配置。
- 必要时对双方 `Piece.js` 增加可注入随机源或测试专用导出。
- 必要时对双方 `GameState.js`/`ScoreManager.js` 增加不改变运行行为的测试入口。
- 不修改 Renderer、SoundManager、平台启动文件、资源和存档键。

如果可通过测试加载器无侵入访问模块，则不修改业务文件，优先选择该方式。

### 15.2 第一阶段测试清单

- Board 放置、越界、重叠、清行、清列、交叉清除。
- Piece 三难度类别、权重边界、候选限制和 20 次保底。
- 固定随机源下两版本候选组结果一致。
- 放置与清线计分公式、最高分更新和管理员排除。
- 三难度道具次数、刷新失败不扣次数、3x3 清除。
- 撤回完整状态恢复且不回滚历史最高分。
- 复活次数、重抽、随机清 5 格和最终结束。
- 设置默认值、缺字段、非法难度、最高分清洗。
- 非法 JSON、存储异常、旧单最高分迁移和幂等。
- 页面状态和弹层转换。

### 15.3 第一阶段完成标准

- 同一套规则测试可分别运行在两版本当前代码上。
- 所有已认定共同规则均有断言。
- 当前已知差异被明确白名单化，不以忽略失败代替说明。
- 测试不需要微信登录、Android WebView、Canvas 或真实音频。
- 未改变任何玩家可见行为和存档数据。

## 16. 不允许在迁移过程中破坏的行为

- 不改变 10x10 棋盘、计分公式、三档难度、方块概率和 20 次保底。
- 不改变道具次数、清除范围、撤回扣次语义和复活规则。
- 不删除或改名现有存档字段和存储键。
- 不重置、合并或覆盖用户各难度已有最高分。
- 不让管理员局写入正式最高分。
- 不把管理员状态、输入码或凭据写入普通存档、日志、文档或共享代码。
- 不让后端失败阻止微信普通本地游戏。
- 不移除 Android 的离线能力、DPR 防护和生命周期暂停能力。
- 不移除微信菜单按钮和安全区适配。
- 不假设完整 Renderer、Canvas 或调度器可直接跨平台共享。
- 不在未建立引用证据和回归验证前删除遗留代码或资源。
- 不使用批量递归删除；任何未来清理必须逐个明确文件处理。

## v1.0.5 candidate clear effect test scope

This candidate keeps all gameplay rules unchanged and adds only a presentation-layer clear effect.

- The existing flow remains: successful placement, completed row/column detection, scoring, board update, feedback state trigger, then Renderer drawing.
- Clear effect state is semantic and shared by behavior: rows, columns, cells, duration, phase, and deterministic particles match between WeChat and Android.
- WeChat and Android Renderers draw their own Canvas overlays. Full Renderer code is still not shared.
- The effect is non-persistent. It is not saved, does not affect high score, does not affect undo snapshots, and is cleared by undo, restart, return home, and revive cleanup.
- Android test APK builds as `versionName = 1.0.5` and `versionCode = 5` only so it can be installed over the current `v1.0.4` app for testing.
