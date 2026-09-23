import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
@Processor('default')
export class DefaultProcessor extends WorkerHost {
  private readonly logger = new Logger(DefaultProcessor.name);
  async process(job: Job<Record<string, unknown>>): Promise<void> { this.logger.log(`Processing ${job.name}: ${JSON.stringify(job.data)}`); }
}
