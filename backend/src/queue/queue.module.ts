import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { DefaultProcessor } from './default.processor';
import { DefaultProducer } from './default.producer';
@Module({
  imports: [BullModule.forRootAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => ({ connection: { host: config.getOrThrow<string>('REDIS_HOST'), port: Number(config.getOrThrow<string>('REDIS_PORT')) } }) }), BullModule.registerQueue({ name: 'default' })],
  providers: [DefaultProducer, DefaultProcessor], exports: [DefaultProducer],
})
export class QueueModule {}
