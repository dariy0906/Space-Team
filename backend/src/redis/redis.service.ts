import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  constructor(config: ConfigService) { this.client = new Redis({ host: config.getOrThrow<string>('REDIS_HOST'), port: Number(config.getOrThrow<string>('REDIS_PORT')), maxRetriesPerRequest: null }); }
  ping(): Promise<string> { return this.client.ping(); }
  getClient(): Redis { return this.client; }
  async onModuleDestroy(): Promise<void> { await this.client.quit(); }
}
