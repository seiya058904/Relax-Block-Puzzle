# Relax Block Puzzle / 轻松俄罗斯方块


<img width="1254" height="1254" alt="ChatGPT Image 2026年5月22日 18_46_41" src="https://github.com/user-attachments/assets/1aa9e50e-9046-486d-8f23-768248b6235e" />

Relax Block Puzzle is a lightweight casual block puzzle game for Android. Drag blocks onto a 10x10 board, fill complete rows or columns, and enjoy a clean, relaxing puzzle experience.

轻松俄罗斯方块是一款轻量级休闲方块消除游戏。玩家拖动方块放入 10x10 棋盘，填满整行或整列即可消除，适合碎片时间轻松游玩。

## Features / 游戏特色

- 10x10 block puzzle board / 10x10 方块棋盘
- Three difficulty levels: Easy, Normal, Master / 三种难度：简单、普通、大师
- Local best scores saved by difficulty / 按难度分别保存本地最高分
- Refresh, Clear, and Undo tools / 刷新、消除、撤销道具
- Four BGM tracks with sound and vibration settings / 四首背景音乐，支持音效和震动设置
- Welfare code based local member benefits / 福利码兑换本地会员权益
- Lightweight offline Android play / 轻量离线安卓游戏，无需联网

## Gameplay / 玩法说明

- Drag one of the available blocks onto the board. / 拖动下方的方块到棋盘上。
- Fill a full row or column to clear it. / 填满一整行或一整列即可消除。
- Choose a suitable difficulty before starting a run. / 开始前选择合适的难度。
- Use tools carefully to recover from difficult board states. / 谨慎使用道具来化解困境。
- Local welfare benefits can grant extra revive chances in offline play. / 本地会员福利可在离线游戏中获得额外复活机会。

## Android APK Release / APK 发布

Source code and project files are stored in this repository. APK files should be attached through GitHub Releases instead of being committed to the repository root.

源代码和项目文件存储在本仓库中。APK 文件应通过 GitHub Releases 附件发布，不直接提交到仓库根目录。

## Installation / 安装方法

1. Download the APK from the latest GitHub Release. / 从最新的 GitHub Release 下载 APK。
2. Transfer it to an Android device if needed. / 如有需要，传输到安卓设备。
3. Allow installation from unknown sources when Android asks for permission. / 在安卓提示时允许安装未知来源应用。
4. Install and open the game. / 安装并打开游戏。

## Tech Notes / 技术说明

- Android shell built with Kotlin and WebView. / 安卓外壳使用 Kotlin + WebView 构建。
- Core gameplay runs from local HTML, JavaScript, and audio assets bundled inside the app. / 核心玩法由本地 HTML、JavaScript 和音频资源驱动。
- Designed as an offline Android version and does not require WeChat login or cloud hosting. / 定位为离线安卓版本，无需微信登录或云托管。

## Version History / 版本历史

`v1.0.2`

- Home screen visual upgrade: gradient panel background, decorative title line, best score card style, button highlight effect / 首页视觉升级：渐变面板背景、标题装饰线、最高分卡片化、按钮高光效果
- Fixed settings/pause buttons blocking score display on the game screen / 修复游戏界面设置/暂停按钮遮挡分数显示
- Fixed welfare code input field not responding to tap on mobile / 修复福利码输入框在手机上无法弹出键盘
- Fixed admin panel entry causing page freeze on rapid taps / 修复管理员入口连续点击导致页面冻结

`v1.0.1`

- Improved Android drag responsiveness / 改善安卓拖拽手感
- Fixed background transition jank when entering recent apps / 修复进入后台/最近任务时的卡顿
- Stabilized Android WebView canvas rendering / 稳定安卓 WebView 画布渲染
- Limited Android canvas DPR for better performance / 限制画布 DPR 提升性能
- Kept APK as an offline debug/preview build / APK 为离线调试/预览版本

## Security Note / 安全说明

- Signing keys, keystores, local environment files, and build caches are intentionally excluded from version control. / 签名密钥、本地环境文件和构建缓存已排除在版本控制之外。
- APK build output is not stored in the repository root. / APK 构建产物不存储在仓库根目录。

## Disclaimer / 免责声明

This is an independent casual block puzzle project and is not affiliated with any official game brand.

本项目为独立休闲方块消除游戏，与任何官方游戏品牌无关。
