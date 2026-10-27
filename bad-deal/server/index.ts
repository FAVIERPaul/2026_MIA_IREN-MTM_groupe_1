import { createApp } from './app.js';
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT invalide.');
const app = createApp();
app.httpServer.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`BAD DEAL : port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
