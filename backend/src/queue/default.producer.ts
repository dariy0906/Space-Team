import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
@Injectable()
export class DefaultProducer {
  constructor(@InjectQueue('default') private readonly queue: Queue) {}
  async addLogJob(payload: Record<string, unknown>): Promise<void> { await this.queue.add('log-json', payload); }
}
