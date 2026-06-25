import { createApp } from './app';

const port = Number(process.env.PORT || 5174);
const app = createApp();

app.listen(port, () => {
  console.log(`[ultra-pdf-image-toolkit] server listening on http://localhost:${port}`);
});
