# 双版本反馈事件与表现状态契约

日期：2026-06-15  
适用范围：微信小游戏版与 Android APK 版

## 1. 目的

本契约统一“发生了什么”和“当前应该画什么”，但不共享完整 Renderer。

- 反馈事件是一次性事实，由 GameState 产生。
- 表现状态是短暂画面状态，由 FeedbackState.js 管理。
- Renderer 只读取表现状态，不计算分数、不更新最高分、不保存存档。
- 音效和震动继续消费原有兼容事件，本阶段没有改变其触发规则。

## 2. 统一模块

两个版本分别保留同路径模块：

- 微信：we xin xiao cheng xu/js/game/FeedbackState.js
- Android：we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/FeedbackState.js

两个文件的公共接口、常量、状态结构和实现内容必须保持一致，并由 SHA-256 和双版本行为测试复核。

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
| itemUsed | 预留给后续统一道具反馈 | 当前阶段未强制迁移 |
| gameOver | 首次进入游戏结束 | 保留现有事件 |
| reviveStarted | 预留给后续复活反馈 | 当前阶段未强制迁移 |
| feedbackCleared | 预留给需要观察清理的消费者 | 当前阶段未强制迁移 |

同一次清线操作只产生一次 piecePlaced、一次 linesCleared 和一次 scoreChanged。符合条件时只产生一次 highScoreBroken。Renderer 重绘不会产生事件。

为保持本阶段音效和震动行为不变，pickup/place/invalid/clear/combo/combo3/gameOver 兼容事件仍保留给现有 Main 消费。

## 4. 表现状态

表现状态包含 clock、clearScore、scorePulse、highScore 和 drag。

- clearScore：active、startedAt、duration、remaining、totalAdded、lineClearScore、bonusScore、clearedLines。
- scorePulse：active、startedAt、duration、remaining。
- highScore：active、startedAt、duration、remaining。
- drag：active、phase、pieceIndex、piece、pointerX/Y、visualX/Y、startX/Y、targetX/Y、displayCellSize、startedAt、duration、remaining。

拖动阶段：

- idle：没有拖动反馈。
- lifting：从候选槽抬升到手指控制位置，200ms。
- dragging：跟随当前视觉位置。
- settling：成功放置后向棋盘落点收束，140ms。
- invalid：无效释放后返回候选槽，160ms。

视觉坐标只用于绘制，不参与棋盘行列计算。

## 5. 时间与覆盖规则

- 清线提示：900ms。
- 分数脉冲：500ms。
- 新纪录提示：1200ms。
- 新清线覆盖旧清线数据，并重新开始清线提示和分数脉冲。
- 普通无清线放置产生 scoreChanged，但保持原微信行为，不启动清线专用分数脉冲。
- 暂停、设置弹层、复活弹层或后台状态下，GameState.update() 不推进，剩余时间冻结。
- 恢复后从剩余时间继续，不重新播放完整时长。
- 重开、返回首页和撤回会清理瞬时反馈。
- 复活会清理旧得分、新纪录和拖动反馈。
- 瞬时状态不进入设置或最高分存档。

## 6. Renderer 边界

Renderer 可以读取 feedbackState，使用剩余时间计算透明度、缩放和位置插值，并绘制清线文字、分数脉冲、新纪录标记和拖动方块。

Renderer 不可以计算或累加分数，修改棋盘、候选、道具或管理员资格，更新最高分或写存档，也不能因每帧重绘重复创建业务事件。

微信 Renderer 保留微信安全区、Canvas 比例和持续帧循环。Android Renderer 保留 DPR 限制和按需渲染，不共享实际 Canvas 绘制代码。

## 7. Android 按需调度

RenderScheduler.js 提供纯判断函数。只有页面明确需要重绘，或清除动画、放置脉冲、通知、拖动、统一反馈仍活跃，并且应用未暂停时，才继续请求帧。

ensureFrame() 继续通过现有 aniId 防止多个并行循环。最后一个反馈结束后不再安排下一帧。

## 8. 自动测试

在共同工作区根目录运行 npm test。

自动覆盖：

- 初始状态、持续时间、覆盖、到期和全部清理。
- 暂停冻结与恢复继续。
- 两版本相同状态转换。
- 拖动五阶段、插值、合法释放、无效释放和 touchcancel。
- 单次业务事件、统一计分 payload、新纪录一次性和管理员隔离。
- 无清线放置不产生清线反馈。
- Android 空闲、活跃、暂停时的调度判断。

测试不证明 Canvas 像素、真实触摸手感、真机帧率、真实音效或震动。

## 9. 后续新增规则

1. 先在两个 FeedbackState.js 中加入相同常量和状态。
2. 先写双版本失败测试，再接入 GameState。
3. 事件只由业务流程产生，Renderer 只消费。
4. 提供明确持续时间、覆盖、暂停、清理和调度规则。
5. 不把瞬时状态写入正式存档。
6. 不借反馈改动改变游戏数值、音效、震动或平台生命周期。


## 10. v1.0.5 clear effect test update

This test update adds board-level line clear effects to both WeChat and Android without changing game rules.

- `FeedbackState.js` owns `clearEffects`, `nextClearEffectId`, `triggerLineClearEffect()`, `createLineClearParticles()`, and `getLineClearEffectVisual()`.
- Each clear event records `clearedRows`, `clearedCols`, sorted unique `cells`, `lineCount`, `duration: 560`, `remaining`, and deterministic particles.
- The visual phases are highlight, sweep, and fade. Renderer code consumes those phases only for drawing.
- `advanceFeedbackState()` advances and expires clear effects only when the game update loop advances, so pause behavior follows the existing feedback timer rule.
- `clearFeedbackState()` removes clear effects for restart, returning home, undo, and revive cleanup paths.
- `hasActiveFeedback()` treats active clear effects as animation work so Android can keep requesting frames only while needed.
- Renderer implementations stay platform-specific; only the event/state semantics are unified.
