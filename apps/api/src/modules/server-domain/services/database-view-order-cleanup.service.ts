import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DatabaseViewOrderRepository } from '../repositories/database-view-order.repository'
import { DatabaseViewRepository } from '../repositories/database.repository'

@Injectable()
export class DatabaseViewOrderCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout
  private running = false
  private readonly logger = new Logger(DatabaseViewOrderCleanupService.name)

  constructor(private readonly orders: DatabaseViewOrderRepository, private readonly views: DatabaseViewRepository) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.drainBatch().catch(error => this.logFailure(error)) }, 5_000)
    this.timer.unref()
    void this.drainBatch().catch(error => this.logFailure(error))
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer) }

  private logFailure(error: unknown): void {
    const kind = error instanceof Error ? error.name : 'UnknownError'
    this.logger.error(`View order cleanup batch failed (${kind}); persisted job will be retried`)
  }

  async drainBatch(): Promise<number> {
    if (this.running) return 0
    this.running = true
    try {
      const job = await this.orders.findCleanupJob()
      if (!job) return 0
      const active = await this.views.listActiveOrderScopeIds(job.workspaceId, job.databaseId)
      if (active.includes(job.orderScopeId)) return 0
      const count = await this.orders.deleteOverrideBatch(job, 500)
      if (count === 0 && !await this.orders.hasOverrides(job)) await this.orders.completeCleanupJob(job)
      return count
    } finally { this.running = false }
  }
}
