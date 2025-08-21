import { EventEmitter } from '../EventEmitter';
import { generateId } from '../utils';
import { PriorityQueue } from './PriorityQueue';
import type { 
  IFrameScheduler, 
  TaskFunction, 
  TaskContext, 
  TaskResult, 
  FrameTask,
  SchedulerStats,
  SchedulerConfig
} from './types';
import { TaskPriority } from './types';

/**
 * RequestAnimationFrame-based task scheduler
 * Executes tasks during browser animation frames for smooth performance
 */
export class FrameScheduler extends EventEmitter implements IFrameScheduler {
  private isActive = false;
  private frameId: number | null = null;
  private taskQueue = new PriorityQueue();
  private recurringTasks = new Map<string, FrameTask>();
  
  private config: Required<SchedulerConfig>;
  private stats: SchedulerStats;
  private startTime = 0;
  private lastFrameTime = 0;

  constructor(config: SchedulerConfig = {}) {
    super();

    this.config = {
      maxTasksPerCycle: config.maxTasksPerCycle ?? 10,
      frameBudget: config.frameBudget ?? 16, // ~60fps
      maxQueueSize: config.maxQueueSize ?? 0, // unlimited
      defaultTimeout: config.defaultTimeout ?? 5000,
      collectStats: config.collectStats ?? true,
      debug: config.debug ?? false,
    };

    this.stats = this.initializeStats();
  }

  // Public API

  async schedule<T>(task: TaskFunction<T>, context: Partial<TaskContext> = {}): Promise<T> {
    return this.nextFrame(task, context);
  }

  async scheduleDelayed<T>(
    task: TaskFunction<T>, 
    delay: number, 
    context: Partial<TaskContext> = {}
  ): Promise<T> {
    // For frame scheduler, delay is measured in frames
    const frameDelay = Math.ceil(delay / 16); // Convert ms to frames
    let frameCount = 0;

    return this.nextFrame(async (ctx) => {
      if (frameCount < frameDelay) {
        frameCount++;
        // Schedule for next frame
        return this.nextFrame(() => task(ctx));
      }
      return task(ctx);
    }, context);
  }

  scheduleRecurring<T>(
    task: TaskFunction<T>, 
    interval: number, 
    context: Partial<TaskContext> = {},
    maxExecutions?: number
  ): string {
    return this.everyFrame(task, { ...context, metadata: { interval, maxExecutions } });
  }

  cancel(taskId: string): boolean {
    // Remove from recurring tasks
    if (this.recurringTasks.has(taskId)) {
      this.recurringTasks.delete(taskId);
      this.updateStats('cancelled');
      return true;
    }

    // Remove from queue (more complex, requires queue search)
    const queueTasks = this.taskQueue.toArray();
    const foundIndex = queueTasks.findIndex(t => t.context.id === taskId);
    
    if (foundIndex !== -1) {
      // Rebuild queue without the cancelled task
      const remaining = queueTasks.filter(t => t.context.id !== taskId);
      this.taskQueue.clear();
      remaining.forEach(t => this.taskQueue.enqueue(t));
      this.updateStats('cancelled');
      return true;
    }

    return false;
  }

  cancelAll(): void {
    const cancelledCount = this.taskQueue.size() + this.recurringTasks.size;
    this.taskQueue.clear();
    this.recurringTasks.clear();
    this.stats.cancelled += cancelledCount;
  }

  // Frame-specific methods

  async nextFrame<T>(task: TaskFunction<T>, context: Partial<TaskContext> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const taskContext = this.createTaskContext(context);
      const frameTask: FrameTask = {
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

      this.enqueueTask(frameTask);
    });
  }

  everyFrame<T>(task: TaskFunction<T>, context: Partial<TaskContext> = {}): string {
    const taskContext = this.createTaskContext(context);
    const frameTask: FrameTask = {
      context: taskContext,
      fn: task,
      recurring: true,
    };

    this.recurringTasks.set(taskContext.id, frameTask);
    this.updateStats('scheduled');
    
    if (!this.isActive) {
      this.start();
    }

    return taskContext.id;
  }

  setFrameBudget(ms: number): void {
    this.config.frameBudget = Math.max(1, ms);
  }

  getFrameBudget(): number {
    return this.config.frameBudget;
  }

  // Scheduler lifecycle

  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.startTime = performance.now();
    this.scheduleFrame();
    (this as any).emit('scheduler:started');
  }

  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
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
        frameRate: this.calculateFrameRate(),
      };
    }
    return this.initializeStats();
  }

  // Private implementation

  private scheduleFrame(): void {
    if (!this.isActive) return;

    this.frameId = requestAnimationFrame((timestamp) => {
      this.executeFrame(timestamp);
      this.scheduleFrame();
    });
  }

  private executeFrame(timestamp: number): void {
    const frameStartTime = performance.now();
    const frameDeadline = frameStartTime + this.config.frameBudget;

    this.lastFrameTime = timestamp;
    let tasksExecuted = 0;

    // Execute recurring tasks first
    for (const [taskId, task] of this.recurringTasks.entries()) {
      if (performance.now() >= frameDeadline || tasksExecuted >= this.config.maxTasksPerCycle) {
        break;
      }

      this.executeTask(task);
      tasksExecuted++;
    }

    // Execute queued tasks
    while (
      !this.taskQueue.isEmpty() && 
      performance.now() < frameDeadline && 
      tasksExecuted < this.config.maxTasksPerCycle
    ) {
      const task = this.taskQueue.dequeue();
      if (task) {
        this.executeTask(task);
        tasksExecuted++;
      }
    }

    const frameTime = performance.now() - frameStartTime;
    
    if (this.config.debug && frameTime > this.config.frameBudget) {
      console.warn(`FrameScheduler: Frame budget exceeded: ${frameTime.toFixed(2)}ms (budget: ${this.config.frameBudget}ms)`);
    }

    (this as any).emit('frame:executed', {
      timestamp,
      frameTime,
      tasksExecuted,
      queueSize: this.taskQueue.size(),
      recurringTasks: this.recurringTasks.size,
    });
  }

  private async executeTask<T>(task: FrameTask): Promise<void> {
    const startTime = performance.now();
    
    try {
      // Set execution start time
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
        console.error(`FrameScheduler: Task '${task.context.name}' failed:`, taskError);
      }
    }
  }

  private enqueueTask<T>(task: FrameTask): void {
    if (this.config.maxQueueSize > 0 && this.taskQueue.size() >= this.config.maxQueueSize) {
      throw new Error(`FrameScheduler: Queue size limit exceeded (${this.config.maxQueueSize})`);
    }

    const priority = (task.context.priority as TaskPriority) ?? TaskPriority.NORMAL;
    this.taskQueue.enqueueWithPriority(task, priority);
    this.updateStats('scheduled');

    if (!this.isActive) {
      this.start();
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
        this.stats.currentQueued = this.taskQueue.size();
        break;
      case 'executed':
        this.stats.executed++;
        this.stats.currentQueued = this.taskQueue.size();
        if (duration !== undefined) {
          this.updateExecutionStats(duration);
        }
        break;
      case 'failed':
        this.stats.failed++;
        this.stats.currentQueued = this.taskQueue.size();
        if (duration !== undefined) {
          this.updateExecutionStats(duration);
        }
        break;
      case 'cancelled':
        this.stats.cancelled++;
        this.stats.currentQueued = this.taskQueue.size();
        break;
    }
  }

  private updateExecutionStats(duration: number): void {
    const totalExecuted = this.stats.executed + this.stats.failed;
    this.stats.averageExecutionTime = 
      (this.stats.averageExecutionTime * (totalExecuted - 1) + duration) / totalExecuted;
    this.stats.maxExecutionTime = Math.max(this.stats.maxExecutionTime, duration);
  }

  private calculateFrameRate(): number {
    // Simple frame rate calculation based on last frame time
    return this.lastFrameTime > 0 ? 1000 / (performance.now() - this.lastFrameTime) : 0;
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
      frameRate: 0,
    };
  }
}