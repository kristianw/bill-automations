import { NestFactory } from '@nestjs/core';
import { EmailPollerModule } from './email-poller/email-poller-module.ts';
import {AppModule} from "./app.module.ts";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
