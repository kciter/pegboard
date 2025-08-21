import { EventEmitter } from '../EventEmitter';
import { FrameScheduler } from './FrameScheduler';
import { TimerScheduler } from './TimerScheduler';
import { ConcurrentTaskManager } from './ConcurrentTaskManager';
import type { 
  IMasterScheduler,
  IFrameScheduler,
  ITimerScheduler,
  IConcurrentTaskManager,
  TaskFunction,
  TaskContext,
  SchedulerConfig
} from './types';

/**
 * Master scheduler that coordinates frame, timer, and concurrent schedulers
 */
export class MasterScheduler extends EventEmitter implements IMasterScheduler {
  private frameScheduler: IFrameScheduler;
  private timerScheduler: ITimerScheduler;
  private concurrentTaskManager: IConcurrentTaskManager;

  constructor(config: SchedulerConfig = {}) {
    super();

    this.frameScheduler = new FrameScheduler(config);
    this.timerScheduler = new TimerScheduler(config);
    this.concurrentTaskManager = new ConcurrentTaskManager(config.defaultTimeout);

    this.setupEventForwarding();
  }

  getFrameScheduler(): IFrameScheduler {
    return this.frameScheduler;
  }

  getTimerScheduler(): ITimerScheduler {
    return this.timerScheduler;
  }

  getConcurrentTaskManager(): IConcurrentTaskManager {
    return this.concurrentTaskManager;
  }

  async schedule<T>(
    task: TaskFunction<T>, 
    type: 'frame' | 'timer' | 'immediate',
    context?: Partial<TaskContext>
  ): Promise<T> {
    switch (type) {
      case 'frame':
        return this.frameScheduler.schedule(task, context);
      case 'timer':
        return this.timerScheduler.schedule(task, context);
      case 'immediate':
        return this.timerScheduler.immediate(task, context);
      default:
        throw new Error(`Unknown scheduler type: ${type}`);
    }
  }

  getCombinedStats(): {
    frame: ReturnType<IFrameScheduler['getStats']>;
    timer: ReturnType<ITimerScheduler['getStats']>;
    concurrent: ReturnType<IConcurrentTaskManager['getStats']>;
  } {
    return {
      frame: this.frameScheduler.getStats(),
      timer: this.timerScheduler.getStats(),
      concurrent: this.concurrentTaskManager.getStats(),
    };
  }

  start(): void {
    this.frameScheduler.start();
    this.timerScheduler.start();
    this.emit('master-scheduler:started');
  }

  stop(): void {
    this.frameScheduler.stop();
    this.timerScheduler.stop();
    this.emit('master-scheduler:stopped');
  }

  isRunning(): boolean {
    return this.frameScheduler.isRunning() || this.timerScheduler.isRunning();
  }

  // Convenience methods for common scheduling patterns

  /**
   * Schedule a task for smooth animation (RAF-based)
   */
  async scheduleAnimation<T>(
    task: TaskFunction<T>,
    context?: Partial<TaskContext>
  ): Promise<T> {
    return this.frameScheduler.nextFrame(task, context);
  }

  /**
   * Schedule a task to run every frame
   */
  scheduleAnimationLoop<T>(
    task: TaskFunction<T>,
    context?: Partial<TaskContext>
  ): string {
    return this.frameScheduler.everyFrame(task, context);
  }

  /**
   * Schedule a task with delay
   */
  async scheduleDelayed<T>(
    task: TaskFunction<T>,
    delay: number,
    context?: Partial<TaskContext>
  ): Promise<T> {
    return this.timerScheduler.delay(task, delay, context);
  }

  /**
   * Schedule a recurring task
   */
  scheduleInterval<T>(
    task: TaskFunction<T>,
    interval: number,
    context?: Partial<TaskContext>,
    maxExecutions?: number
  ): string {
    return this.timerScheduler.interval(task, interval, context, maxExecutions);
  }

  /**
   * Execute tasks with concurrency control
   */
  async executeConcurrent<T>(
    tasks: TaskFunction<T>[],
    concurrencyLimit: number = 5
  ): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
    const results = await this.concurrentTaskManager.executeConcurrent(tasks, concurrencyLimit);
    return results.map(r => ({
      success: r.success,
      result: r.result,
      error: r.error,
    }));
  }

  /**
   * Execute tasks in parallel (unlimited concurrency)
   */
  async executeParallel<T>(
    tasks: TaskFunction<T>[]
  ): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
    const results = await this.concurrentTaskManager.executeParallel(tasks);
    return results.map(r => ({
      success: r.success,
      result: r.result,
      error: r.error,
    }));
  }

  /**
   * Execute tasks sequentially
   */
  async executeSequential<T>(
    tasks: TaskFunction<T>[]
  ): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
    const results = await this.concurrentTaskManager.executeSequential(tasks);
    return results.map(r => ({
      success: r.success,
      result: r.result,
      error: r.error,
    }));
  }

  /**
   * Cancel task from any scheduler
   */
  cancelTask(taskId: string): boolean {
    return (
      this.frameScheduler.cancel(taskId) ||
      this.timerScheduler.cancel(taskId)
    );
  }

  /**
   * Cancel all tasks from all schedulers
   */
  cancelAllTasks(): void {
    this.frameScheduler.cancelAll();
    this.timerScheduler.cancelAll();
  }

  /**
   * Get comprehensive scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    frameScheduler: {
      isRunning: boolean;
      stats: ReturnType<IFrameScheduler['getStats']>;
    };
    timerScheduler: {
      isRunning: boolean;
      stats: ReturnType<ITimerScheduler['getStats']>;
    };
    concurrentManager: {
      stats: ReturnType<IConcurrentTaskManager['getStats']>;
    };
  } {
    return {
      isRunning: this.isRunning(),
      frameScheduler: {
        isRunning: this.frameScheduler.isRunning(),
        stats: this.frameScheduler.getStats(),
      },
      timerScheduler: {
        isRunning: this.timerScheduler.isRunning(),
        stats: this.timerScheduler.getStats(),
      },
      concurrentManager: {
        stats: this.concurrentTaskManager.getStats(),
      },
    };
  }

  // Private methods

  private setupEventForwarding(): void {
    // Forward frame scheduler events
    this.frameScheduler.on('task:completed', (event) => {
      this.emit('task:completed', { ...event, scheduler: 'frame' });
    });
    this.frameScheduler.on('task:failed', (event) => {
      this.emit('task:failed', { ...event, scheduler: 'frame' });
    });
    this.frameScheduler.on('frame:executed', (event) => {
      this.emit('frame:executed', event);
    });

    // Forward timer scheduler events
    this.timerScheduler.on('task:completed', (event) => {
      this.emit('task:completed', { ...event, scheduler: 'timer' });
    });
    this.timerScheduler.on('task:failed', (event) => {
      this.emit('task:failed', { ...event, scheduler: 'timer' });
    });

    // Forward concurrent manager events
    this.concurrentTaskManager.on('task:completed', (event) => {
      this.emit('task:completed', { ...event, scheduler: 'concurrent' });
    });
    this.concurrentTaskManager.on('batch:completed', (event) => {
      this.emit('batch:completed', event);
    });
    this.concurrentTaskManager.on('batch:started', (event) => {
      this.emit('batch:started', event);
    });
  }
}