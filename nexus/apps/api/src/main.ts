import 'dotenv/config';
import 'reflect-metadata';
import { createApp, mountDocs } from './setup';
async function bootstrap() {
  const app = await createApp();
  if (process.env.NODE_ENV !== 'production') mountDocs(app);
  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`NEXUS API listening on ${port} (docs at /api/docs outside production)`);
}
bootstrap();
