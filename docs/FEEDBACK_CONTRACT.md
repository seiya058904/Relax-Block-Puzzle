# 三端反馈事件与表现状态契约

更新：2026-10-04
适用范围：Web、Android APK 与微信小游戏

## 1. 目的

本契约统一“发生了什么”和“当前应该画什么”，但不共享完整 Renderer。

- 反馈事件是一次性事实，由 GameState 产生。
- 表现状态是短暂画面状态，由 FeedbackState.js 管理。
- Renderer 只读取表现状态，不计算分数、不更新最高分、不保存存档。
- 音效和震动由 Main 消费 `Presentation.getFeedbackCue()`，一次结果只有一个播放入口。

## 2. 统一模块

三端分别保留同路径模块：

- 微信：we xin xiao cheng xu/js/game/FeedbackState.js
- Android：we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/FeedbackState.js
- Web：we xin xiao cheng xu-android-apk/docs/js/game/FeedbackState.js

三个 FeedbackState 文件的公共接口、常量、状态结构和实现内容必须保持一致，由字节一致性和三端行为测试复核。`shared/js/game/Presentation.js` 提供纯表现计算和声音/震动映射，通过平台清单生成三端副本；各 Renderer 保持独立。

## 3. 统一事件

统一业务事件结构包含 type、timestamp 和 payload。

| 事件 | 触发条件 | 关键 payload |
|---|---|---|
| piecePicked | 成功开始拖动未使用候选方块 | pieceIndex/piece/pointerX/pointerY |
| piecePlaced | 方块成功写入棋盘且只触发一次 | pieceIndex/piece/row/col/clearedLines/scoreResult |
| invalidPlacement | 释放位置不可放置 | pieceIndex/row/col |
| linesCleared | 延迟清除完成并应用清线计分 | rows/cols/scoreResult |
| scoreChanged | 一次玩家操作的计分结果确定 | scoreBefore/scoreAfter/totalAdded |
| highScoreBroken | 正式可计分局首次超过开局最高分 | previous/current/difficulty |
| itemUsed | 刷新、清除、撤回成功后各一次 | item/remaining |
| gameOver | 首次进入游戏结束 | 保留现有事件 |
| reviveStarted | 通过复活资格检查后开始处理 | remainingBefore/isAdmin |
| reviveCompleted | 复活成功后各一次 | remainingAfter/clearedCells |
| feedbackCleared | 预留给需要观察清理的消费者 | 当前阶段未强制迁移 |

同一次清线操作只产生一次 piecePlaced、一次 linesCleared 和一次 scoreChanged。符合条件时只产生一次 highScoreBroken。Renderer 重绘不会产生事件。

pickup/place/invalid/clear/combo/combo3/gameOver 兼容事件保留。刷新、撤回的成功 click 由 itemUsed 负责；清除道具继续由 clear 负责，itemUsed 不重复播放；复活由 reviveStarted 负责。拿起只播放原有音效，放置/失败使用 light，清线/双线使用 medium，多线使用 heavy；刷新/撤回 light，复活 medium。平台不支持震动时正常降级。

## 4. 表现状态

表现状态包含 clock、clearScore、scorePulse、highScore、drag、clearEffects、gain、action 和 uiMotion。

- clearScore：active、startedAt、duration、remaining、totalAdded、lineClearScore、bonusScore、clearedLines。
- scorePulse：active、startedAt、duration、remaining。
- highScore：active、startedAt、duration、remaining。
- drag：原有位置字段，以及 originCellSize、targetCellSize、releaseScale、releaseElevation 和目标行列。
- gain：240ms 分数显示插值，from/to/totalAdded；实际 score 已由原计分流程确定，绘制不写回数值。
- action：260ms 刷新、撤回、清除、复活或候选补充反馈；格子最多 100 个，候选依次延迟 24ms 入场。

拖动阶段：

- idle：没有拖动反馈。
- lifting：从候选槽抬升到手指控制位置，200ms。
- dragging：跟随当前视觉位置。
- settling：成功放置后向棋盘落点收束，140ms。
- invalid：无效释放后返回候选槽，160ms。

视觉坐标只用于绘制，不参与棋盘行列计算。

抬升从候选块实际尺寸和位置开始。释放记录当帧的位置、缩放和高度，快速松手也连续；成功落下保持不透明并收束到棋盘格尺寸，失败沿当前位置返回原候选尺寸。棋盘已写入的目标块在落下期间由拖拽层绘制，避免重影。

## 5. 时间与覆盖规则

- 清线提示：900ms。
- 分数脉冲：500ms。
- 新纪录提示：1200ms。
- 新清线覆盖旧清线数据，并重新开始清线提示和分数脉冲。
- 普通无清线放置产生 scoreChanged，但保持原微信行为，不启动清线专用分数脉冲。
- 暂停、设置弹层、复活弹层或后台状态下，GameState.update() 不推进，剩余时间冻结。
- 恢复后从剩余时间继续，不重新播放完整时长。
- 重开、返回首页和撤回会清理旧瞬时反馈；新候选随后播放 refill，撤回随后播放 undo，不重播旧清线或纪录。
- 复活会清理旧得分、新纪录和拖动反馈。
- 瞬时状态不进入设置或最高分存档。

## 6. Renderer 边界

Renderer 可以读取 feedbackState，使用剩余时间计算透明度、缩放和位置插值，并绘制清线文字、分数脉冲、新纪录标记和拖动方块。

Renderer 不可以计算或累加分数，修改棋盘、候选、道具或管理员资格，更新最高分或写存档，也不能因每帧重绘重复创建业务事件。

三端 Renderer 保留各自布局、安全区、输入和 Canvas 绘制代码。三端均按需调度，后台停帧；微信使用原生触摸和生命周期回调，Web/Android 使用现有浏览器/宿主适配。Web/Android 的系统减少动画偏好会关闭位移与缩放，保留结果淡入淡出。

## 7. 三端按需调度

RenderScheduler.js 提供纯判断函数。只有页面明确需要重绘，或清除动画、放置脉冲、通知、拖动、统一反馈仍活跃，并且应用未暂停时，才继续请求帧。

微信 Main 在原生输入回调后唤醒同一帧循环，独立判断相同活跃状态。模态开关动画独立推进，但不推进被冻结的游戏时间。隐藏时取消触摸会话、清空排队输入与待消费旧声音事件，恢复时重新读取窗口、DPR、安全区和胶囊位置。

ensureFrame() 继续通过现有 aniId 防止多个并行循环。最后一个反馈结束后不再安排下一帧。

## 8. 自动测试

在共同工作区根目录运行 npm test。

自动覆盖：

- 初始状态、持续时间、覆盖、到期和全部清理。
- 暂停冻结与恢复继续。
- 三端相同状态转换、工具结果和缓存容量。
- 拖动五阶段、插值、合法释放、无效释放和 touchcancel。
- 单次业务事件、统一计分 payload、新纪录一次性和管理员隔离。
- 无清线放置不产生清线反馈。
- 三端 Main 空闲、活跃、暂停、后台恢复和尺寸变化。

测试不证明 Canvas 像素、真实触摸手感、真机帧率、真实音效或震动。

## 9. 后续新增规则

1. 在三个 FeedbackState.js 中加入相同常量和状态。
2. 先写对应行为测试，再接入 GameState。
3. 事件只由业务流程产生，Renderer 只消费。
4. 提供明确持续时间、覆盖、暂停、清理和调度规则。
5. 不把瞬时状态写入正式存档。
6. 不借反馈改动改变游戏数值、资格、生成或存档；声音/震动与生命周期调整必须有对应回归证据。


## 10. v1.0.5 clear effect test update

This test update adds board-level line clear effects to both WeChat and Android without changing game rules.

- `FeedbackState.js` owns `clearEffects`, `nextClearEffectId`, `triggerLineClearEffect()`, `createLineClearParticles()`, and `getLineClearEffectVisual()`.
- Each clear event records `clearedRows`, `clearedCols`, sorted unique `cells`, `lineCount`, `duration: 560`, `remaining`, and deterministic particles.
- The visual phases are highlight, sweep, and fade. Renderer code consumes those phases only for drawing.
- `advanceFeedbackState()` advances and expires clear effects only when the game update loop advances, so pause behavior follows the existing feedback timer rule.
- `clearFeedbackState()` removes clear effects for restart, returning home, undo, and revive cleanup paths.
- `hasActiveFeedback()` treats active clear effects as animation work so Android can keep requesting frames only while needed.
- Renderer implementations stay platform-specific; only the event/state semantics are unified.

## 11. 2026-10-04 材质、方向与性能预算

- 静态背景和内凹棋盘分别缓存，方块使用低成本缎面高光、暗色底面和倒角。拖拽阴影随高度变化，无每格 blur。
- 清线保留原格子颜色，交叉格仅记录一次。从放置中心沿各自行列消退；动画状态仍为 560ms，业务清除仍按原 180ms 提交。新放置不会被旧清线幽灵覆盖。
- 粒子上限为微信 light 6、Web/Android full 12，按行数实际取更小数量；不用棋盘震动或大面积爆闪遮盖方向。
- 候选补充、刷新、撤回、复活的 260ms 反馈到期后释放临时格子。纪录提示留在最高分区域，通知避开棋盘和候选。
- 最大 DPR：light 2、full 2.5；总像素预算分别为 4,000,000 / 5,000,000，包含主画布和缓存预留。缓存最多 750,000 / 1,250,000 像素，背景占 25%、棋盘占 75%；尺寸变化释放旧表面，缺少离屏 API 时直接绘制。
- 安静拖拽帧裁剪棋盘、候选及前后拖拽包围区，其余状态完整重绘。调试帧时样本最多 180 条。
- `tests/browser/quality.mjs` 使用原始唯一 Main 实例，真实鼠标/CDP 触摸测试合法夹具，比较局部与完整重绘像素，并证明压力测试的实际时长与帧数。微信 Chromium host 仅验证平台代码，不能替代微信开发者工具和真机声音/震动验收。
