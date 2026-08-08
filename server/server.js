const { buildApp } = require('./app');

const port = Number(process.env.PORT) || 80;
const app = buildApp();

app.listen(port, () => {
  console.log(`weixin-block-backend listening on port ${port}`);
});
