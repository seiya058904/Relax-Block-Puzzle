# Relax Block Puzzle 网页版

此目录是 Relax Block Puzzle 的 GitHub Pages 网页版发布目录，内容来自 Android WebView 使用的本地网页资源。

网页入口是 [`docs/index.html`](index.html)。

本地预览时，请在仓库根目录运行静态服务器：

```powershell
python -m http.server 8000 -d docs
```

然后在浏览器访问 <http://localhost:8000/>。

不要使用 `file://` 直接打开 `index.html`，因为浏览器可能阻止 JavaScript 模块正常加载。
