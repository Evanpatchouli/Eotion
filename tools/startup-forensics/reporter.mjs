import { createWriteStream, mkdirSync } from 'node:fs'
import path from 'node:path'

export default class StartupForensicsReporter {
  constructor(options = {}) {
    this.runDir = options.runDir ?? process.env.FORENSICS_RUN_DIR
    if (!this.runDir) throw new Error('FORENSICS_RUN_DIR is required by startup-forensics reporter')
    mkdirSync(this.runDir, { recursive: true })
    this.stream = createWriteStream(path.join(this.runDir, 'test-order.jsonl'), { flags: 'a' })
    this.stream.on('error', (error) => {
      process.stderr.write(`[startup-forensics reporter error] ${error.stack ?? error.message}\n`)
    })
  }

  write(record) {
    if (this.stream.destroyed || this.stream.writableEnded) return
    try {
      this.stream.write(`${JSON.stringify(record)}\n`)
    } catch (error) {
      process.stderr.write(`[startup-forensics reporter write error] ${error.stack ?? error.message}\n`)
    }
  }

  onTestBegin(test, result) {
    this.write({
      event: 'testBegin',
      wallTime: new Date().toISOString(),
      monotonicMs: performance.now(),
      pid: process.pid,
      workerIndex: result.workerIndex,
      parallelIndex: result.parallelIndex,
      file: test.location.file,
      title: test.titlePath(),
      retry: result.retry,
    })
  }

  onTestEnd(test, result) {
    this.write({
      event: 'testEnd',
      wallTime: new Date().toISOString(),
      monotonicMs: performance.now(),
      pid: process.pid,
      workerIndex: result.workerIndex,
      parallelIndex: result.parallelIndex,
      file: test.location.file,
      title: test.titlePath(),
      status: result.status,
      expectedStatus: test.expectedStatus,
      durationMs: result.duration,
      retry: result.retry,
    })
  }

  async onEnd() {
    await new Promise((resolve) => {
      this.stream.end(resolve)
      this.stream.once('error', resolve)
    })
  }
}
