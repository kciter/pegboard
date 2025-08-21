import { EventEmitter } from '../EventEmitter';
import { generateId } from '../utils';
import { PriorityQueue } from './PriorityQueue';
import type { 
  ITimerScheduler, 
  TaskFunction, 
  TaskContext, 
  TaskResult, 
  ScheduledTask,
  SchedulerStats,
  SchedulerConfig
} from './types';
import { TaskPriority } from './types';

/**
 * setTimeout/setInterval-based task scheduler
 * Good for delayed execution and background tasks
 */
export class TimerScheduler extends EventEmitter implements ITimerScheduler {
  private isActive = false;
  private taskQueue = new PriorityQueue();
  private scheduledTasks = new Map<string, { handle: any; task: ScheduledTask }>();
  private intervalTasks = new Map<string, { handle: any; task: ScheduledTask }>();
  
  private config: Required<SchedulerConfig>;
  private stats: SchedulerStats;
  private startTime = 0;

  constructor(config: SchedulerConfig = {}) {
    super();

    this.config = {
      maxTasksPerCycle: config.maxTasksPerCycle ?? 50,
      frameBudget: config.frameBudget ?? 0, // Not used for timer scheduler
      maxQueueSize: config.maxQueueSize ?? 0,
      defaultTimeout: config.defaultTimeout ?? 5000,
      collectStats: config.collectStats ?? true,
      debug: config.debug ?? false,
    };

    this.stats = this.initializeStats();
  }

  // Public API

  async schedule<T>(task: TaskFunction<T>, context: Partial<TaskContext> = {}): Promise<T> {
    return this.immediate(task, context);
  }

  async scheduleDelayed<T>(
    task: TaskFunction<T>, 
    delay: number, 
    context: Partial<TaskContext> = {}
  ): Promise<T> {
    return this.delay(task, delay, context);
  }

  scheduleRecurring<T>(
    task: TaskFunction<T>, 
    interval: number, 
    context: Partial<TaskContext> = {},
    maxExecutions?: number
  ): string {
    return this.interval(task, interval, context, maxExecutions);
  }

  cancel(taskId: string): boolean {
    // Check scheduled tasks
    const scheduled = this.scheduledTasks.get(taskId);
    if (scheduled) {
      clearTimeout(scheduled.handle);
      this.scheduledTasks.delete(taskId);
      this.updateStats('cancelled');
      return true;
    }

    // Check interval tasks
    const interval = this.intervalTasks.get(taskId);
    if (interval) {
      clearInterval(interval.handle);
      this.intervalTasks.delete(taskId);
      this.updateStats('cancelled');
      return true;
    }

    // Check task queue
    const queueTasks = this.taskQueue.toArray();
    const foundIndex = queueTasks.findIndex(t => t.context.id === taskId);
    
    if (foundIndex !== -1) {
      const remaining = queueTasks.filter(t => t.context.id !== taskId);
      this.taskQueue.clear();
      remaining.forEach(t => this.taskQueue.enqueue(t));
      this.updateStats('cancelled');
      return true;
    }

    return false;
  }

  cancelAll(): void {
    // Clear all scheduled tasks
    for (const [taskId, { handle }] of this.scheduledTasks) {
      clearTimeout(handle);
    }

    // Clear all interval tasks
    for (const [taskId, { handle }] of this.intervalTasks) {
      clearInterval(handle);
    }

    const cancelledCount = this.scheduledTasks.size + this.intervalTasks.size + this.taskQueue.size();

    this.scheduledTasks.clear();
    this.intervalTasks.clear();
    this.taskQueue.clear();

    this.stats.cancelled += cancelledCount;
  }

  // Timer-specific methods

  async immediate<T>(task: TaskFunction<T>, context: Partial<TaskContext> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const taskContext = this.createTaskContext(context);
      const scheduledTask: ScheduledTask = {
        context: taskContext,
        fn: task,
        callback: (result) => {
          if (result.success) {
            resolve(result.result!);
          } else {
            reject(result.error);
          }
        },
      };

      this.enqueueTask(scheduledTask);
    });
  }

  async delay<T>(task: TaskFunction<T>, ms: number, context: Partial<TaskContext> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const taskContext = this.createTaskContext(context);
      const scheduledTask: ScheduledTask = {
        context: taskContext,
        fn: task,
        delay: ms,
        callback: (result) => {
          if (result.success) {
            resolve(result.result!);
          } else {
            reject(result.error);
          }
        },
      };

      this.scheduleDelayedTask(scheduledTask);
    });
  }

  interval<T>(
    task: TaskFunction<T>, 
    ms: number, 
    context: Partial<TaskContext> = {},
    maxExecutions?: number
  ): string {
    const taskContext = this.createTaskContext(context);
    const scheduledTask: ScheduledTask = {
      context: taskContext,
      fn: task,
      interval: ms,
      maxExecutions,
      executionCount: 0,
    };

    this.scheduleIntervalTask(scheduledTask);
    this.updateStats('scheduled');

    return taskContext.id;
  }

  // Scheduler lifecycle

  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.startTime = performance.now();
    
    // Process immediate queue
    this.processQueue();
    
    (this as any).emit('scheduler:started');
  }

  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.cancelAll();
    (this as any).emit('scheduler:stopped');
  }

  isRunning(): boolean {
    return this.isActive;
  }

  getStats(): SchedulerStats {
    if (this.config.collectStats) {
      return {
        ...this.stats,
        uptime: this.isActive ? performance.now() - this.startTime : 0,
        currentQueued: this.taskQueue.size() + this.scheduledTasks.size + this.intervalTasks.size,
      };
    }
    return this.initializeStats();
  }

  // Private implementation

  private scheduleDelayedTask<T>(task: ScheduledTask): void {
    const handle = setTimeout(() => {
      this.scheduledTasks.delete(task.context.id);
      this.executeTask(task);
    }, task.delay || 0);

    this.scheduledTasks.set(task.context.id, { handle, task });
    this.updateStats('scheduled');
  }

  private scheduleIntervalTask<T>(task: ScheduledTask): void {
    const handle = setInterval(() => {
      // Check execution limit
      if (task.maxExecutions && task.executionCount! >= task.maxExecutions) {
        clearInterval(handle);
        this.intervalTasks.delete(task.context.id);
        return;
      }

      task.executionCount = (task.executionCount || 0) + 1;
      this.executeTask(task);
    }, task.interval || 0);

    this.intervalTasks.set(task.context.id, { handle, task });
  }

  private processQueue(): void {
    if (!this.isActive) return;

    let tasksProcessed = 0;
    while (!this.taskQueue.isEmpty() && tasksProcessed < this.config.maxTasksPerCycle) {
      const task = this.taskQueue.dequeue();
      if (task) {
        this.executeTask(task);
        tasksProcessed++;
      }
    }

    // Schedule next queue processing if there are remaining tasks
    if (!this.taskQueue.isEmpty()) {
      setTimeout(() => this.processQueue(), 0);
    }
  }

  private async executeTask<T>(task: ScheduledTask): Promise<void> {
    const startTime = performance.now();
    
    try {
      task.context.startedAt = startTime;

      // Create timeout promise if timeout is configured
      let timeoutHandle: any = null;
      const timeoutPromise = task.context.timeout ? new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Task '${task.context.name}' timed out after ${task.context.timeout}ms`));
        }, task.context.timeout);
      }) : null;

      // Execute task with optional timeout
      const resultPromise = Promise.resolve(task.fn(task.context));
      const result = timeoutPromise 
        ? await Promise.race([resultPromise, timeoutPromise])
        : await resultPromise;

      // Clear timeout if it was set
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      const duration = performance.now() - startTime;

      const taskResult: TaskResult<T> = {
        context: task.context,
        success: true,
        result,
        duration,
        completedAt: performance.now(),
      };

      this.updateStats('executed', duration);
      task.callback?.(taskResult);
      
      (this as any).emit('task:completed', taskResult);

    } catch (error) {
      const duration = performance.now() - startTime;
      const taskError = error instanceof Error ? error : new Error(String(error));

      const taskResult: TaskResult<T> = {
        context: task.context,
        success: false,
        error: taskError,
        duration,
        completedAt: performance.now(),
      };

      this.updateStats('failed', duration);
      task.callback?.(taskResult);
      
      (this as any).emit('task:failed', taskResult);
      
      if (this.config.debug) {
        console.error(`TimerScheduler: Task '${task.context.name}' failed:`, taskError);
      }
    }
  }

  private enqueueTask<T>(task: ScheduledTask): void {
    if (this.config.maxQueueSize > 0 && this.taskQueue.size() >= this.config.maxQueueSize) {
      throw new Error(`TimerScheduler: Queue size limit exceeded (${this.config.maxQueueSize})`);
    }

    const priority = (task.context.priority as TaskPriority) ?? TaskPriority.NORMAL;
    this.taskQueue.enqueueWithPriority(task, priority);
    this.updateStats('scheduled');

    if (!this.isActive) {
      this.start();
    } else {
      // Trigger immediate queue processing
      setTimeout(() => this.processQueue(), 0);
    }
  }

  private createTaskContext(context: Partial<TaskContext>): TaskContext {
    return {
      id: context.id ?? generateId(),
      name: context.name ?? 'unnamed-task',
      priority: context.priority ?? TaskPriority.NORMAL,
      createdAt: performance.now(),
      timeout: context.timeout ?? this.config.defaultTimeout,
      metadata: context.metadata ?? {},
    };
  }

  private updateStats(type: 'scheduled' | 'executed' | 'failed' | 'cancelled', duration?: number): void {
    if (!this.config.collectStats) return;

    switch (type) {
      case 'scheduled':
        this.stats.totalScheduled++;
        break;
      case 'executed':
        this.stats.executed++;
        if (duration !== undefined) {
          this.updateExecutionStats(duration);
        }
        break;
      case 'failed':
        this.stats.failed++;
        if (duration !== undefined) {
          this.updateExecutionStats(duration);
        }
        break;
      case 'cancelled':
        this.stats.cancelled++;
        break;
    }
  }

  private updateExecutionStats(duration: number): void {
    const totalExecuted = this.stats.executed + this.stats.failed;
    this.stats.averageExecutionTime = 
      (this.stats.averageExecutionTime * (totalExecuted - 1) + duration) / totalExecuted;
    this.stats.maxExecutionTime = Math.max(this.stats.maxExecutionTime, duration);
  }

  private initializeStats(): SchedulerStats {
    return {
      totalScheduled: 0,
      currentQueued: 0,
      executed: 0,
      failed: 0,
      cancelled: 0,
      averageExecutionTime: 0,
      maxExecutionTime: 0,
      uptime: 0,
    };
  }
}