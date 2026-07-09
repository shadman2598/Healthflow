import "dotenv/config";
import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

async function bootstrap(): Promise<void> {
  await prisma.$connect();

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
