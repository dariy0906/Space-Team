import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try { await this.prisma.$queryRawUnsafe('SELECT 1'); await this.redis.ping(); return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException('Database or Redis is unavailable'); }
  }
}
