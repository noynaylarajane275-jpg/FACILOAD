import 'dotenv/config';
import { createApp, ensureUploadDirs } from './app.js';
import { prisma } from './config/prisma.js';

const port = Number(process.env.PORT ?? 4000);

async function start(): Promise<void> {
  // Migrate existing installations to the two-role model. Old manager
  // accounts keep working with the unified Chair permissions.
  await prisma.user.updateMany({
    where: { role: 'ACADEMIC_ADMIN' },
    data: { role: 'CHAIR' },
  });
  ensureUploadDirs();
  const app = createApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${port}`);
  });
}

void start().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[api] failed to start', error);
  process.exitCode = 1;
});
