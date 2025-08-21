/**
 * Scheduling and task queue types for Pegboard
 */

/**
 * Task priority levels
 */
export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3,
}

/**
 * Task execution context
 */
export interface TaskContext {
  /** Task unique identifier */
  id: string;
  /** Task name for debugging */
  name: string;
  /** Task priority */
  priority: TaskPriority;
  /** Timestamp when task was created */
  createdAt: number;
  /** Timestamp when task was scheduled */
  scheduledAt?: number;
  /** Timestamp when task started executing */
  startedAt?: number;
  /** Maximum execution time in milliseconds */
  timeout?: number;
  /** Task metadata */
  metadata?: Record<string, any>;
}

/**
 * Task function signature
 */
export type TaskFunction<T = any> = (context: TaskContext) => Promise<T> | T;

/**
 * Task execution result
 */
export interface TaskResult<T = any> {
  /** Task context */
  context: TaskContext;
  /** Task execution success status */
  success: boolean;
  /** Task result data */
  result?: T;
  /** Execution error if failed */
  error?: Error;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Timestamp when task completed */
  completedAt: number;
}

/**
 * Task definition
 */
export interface Task<T = any> {
  /** Task context */
  context: TaskContext;
  /** Task function to execute */
  fn: TaskFunction<T>;
  /** Task callback for completion */
  callback?: (result: TaskResult<T>) => void;
}

/**
 * Frame-based task (for RAF scheduler)
 */
export interface FrameTask extends Task {
  /** Whether this task should run every frame */
  recurring?: boolean;
  /** Frame budget in milliseconds */
  frameBudget?: number;
}

/**
 * Scheduled task (for timer-based scheduler)
 */
export interface ScheduledTask extends Task {
  /** Delay in milliseconds before execution */
  delay?: number;
  /** Interval for recurring tasks in milliseconds */
  interval?: number;
  /** Maximum number of executions for recurring tasks */
  maxExecutions?: number;
  /** Current execution count */
  executionCount?: number;
}

/**
 * Task scheduler interface
 */
export interface ITaskScheduler {
  /** Schedule a task for execution */
  schedule<T>(task: TaskFunction<T>, context?: Partial<TaskContext>): Promise<T>;
  /** Schedule a task with specific timing */
  scheduleDelayed<T>(task: TaskFunction<T>, delay: number, context?: Partial<TaskContext>): Promise<T>;
  /** Schedule a recurring task */
  scheduleRecurring<T>(
    task: TaskFunction<T>, 
    interval: number, 
    context?: Partial<TaskContext>,
    maxExecutions?: number
  ): string; // Returns task ID for cancellation
  /** Cancel a scheduled task */
  cancel(taskId: string): boolean;
  /** Cancel all tasks */
  cancelAll(): void;
  /** Get scheduler statistics */
  getStats(): SchedulerStats;
  /** Start/stop the scheduler */
  start(): void;
  stop(): void;
  /** Check if scheduler is running */
  isRunning(): boolean;
}

/**
 * Frame scheduler interface (RAF-based)
 */
export interface IFrameScheduler extends ITaskScheduler {
  /** Schedule a task to run on next frame */
  nextFrame<T>(task: TaskFunction<T>, context?: Partial<TaskContext>): Promise<T>;
  /** Schedule a task to run every frame */
  everyFrame<T>(task: TaskFunction<T>, context?: Partial<TaskContext>): string;
  /** Set frame budget for task execution */
  setFrameBudget(ms: number): void;
  /** Get current frame budget */
  getFrameBudget(): number;
}

/**
 * Timer scheduler interface (setTimeout/setInterval-based)
 */
export interface ITimerScheduler extends ITaskScheduler {
  /** Schedule immediate execution */
  immediate<T>(task: TaskFunction<T>, context?: Partial<TaskContext>): Promise<T>;
  /** Schedule with specific delay */
  delay<T>(task: TaskFunction<T>, ms: number, context?: Partial<TaskContext>): Promise<T>;
  /** Schedule recurring execution */
  interval<T>(
    task: TaskFunction<T>, 
    ms: number, 
    context?: Partial<TaskContext>,
    maxExecutions?: number
  ): string;
}

/**
 * Task queue interface
 */
export interface ITaskQueue {
  /** Add task to queue */
  enqueue<T>(task: Task<T>): void;
  /** Remove and return next task */
  dequeue(): Task | null;
  /** Peek at next task without removing */
  peek(): Task | null;
  /** Get queue size */
  size(): number;
  /** Check if queue is empty */
  isEmpty(): boolean;
  /** Clear all tasks */
  clear(): void;
  /** Get all tasks (for debugging) */
  toArray(): Task[];
}

/**
 * Priority queue interface for task scheduling
 */
export interface IPriorityQueue extends ITaskQueue {
  /** Add task with priority */
  enqueueWithPriority<T>(task: Task<T>, priority: TaskPriority): void;
}

/**
 * Scheduler statistics
 */
export interface SchedulerStats {
  /** Total tasks scheduled */
  totalScheduled: number;
  /** Tasks currently queued */
  currentQueued: number;
  /** Tasks executed successfully */
  executed: number;
  /** Tasks failed */
  failed: number;
  /** Tasks cancelled */
  cancelled: number;
  /** Average execution time in milliseconds */
  averageExecutionTime: number;
  /** Maximum execution time in milliseconds */
  maxExecutionTime: number;
  /** Scheduler uptime in milliseconds */
  uptime: number;
  /** Current frame rate (for frame scheduler) */
  frameRate?: number;
}

/**
 * Task scheduler configuration
 */
export interface SchedulerConfig {
  /** Maximum number of tasks to execute per frame/cycle */
  maxTasksPerCycle?: number;
  /** Frame budget in milliseconds (for RAF scheduler) */
  frameBudget?: number;
  /** Maximum queue size (0 = unlimited) */
  maxQueueSize?: number;
  /** Default task timeout in milliseconds */
  defaultTimeout?: number;
  /** Whether to collect execution statistics */
  collectStats?: boolean;
  /** Whether to log task execution (for debugging) */
  debug?: boolean;
}

/**
 * Concurrent task manager interface
 */
export interface IConcurrentTaskManager {
  /** Execute tasks concurrently with limit */
  executeConcurrent<T>(tasks: TaskFunction<T>[], concurrencyLimit: number): Promise<TaskResult<T>[]>;
  /** Execute tasks in parallel (no limit) */
  executeParallel<T>(tasks: TaskFunction<T>[]): Promise<TaskResult<T>[]>;
  /** Execute tasks in sequence */
  executeSequential<T>(tasks: TaskFunction<T>[]): Promise<TaskResult<T>[]>;
  /** Execute tasks with batching */
  executeBatched<T>(
    tasks: TaskFunction<T>[], 
    batchSize: number,
    batchDelay?: number
  ): Promise<TaskResult<T>[]>;
}

/**
 * Master scheduler interface that coordinates multiple schedulers
 */
export interface IMasterScheduler {
  /** Get frame scheduler */
  getFrameScheduler(): IFrameScheduler;
  /** Get timer scheduler */
  getTimerScheduler(): ITimerScheduler;
  /** Get concurrent task manager */
  getConcurrentTaskManager(): IConcurrentTaskManager;
  /** Schedule task on most appropriate scheduler */
  schedule<T>(
    task: TaskFunction<T>, 
    type: 'frame' | 'timer' | 'immediate',
    context?: Partial<TaskContext>
  ): Promise<T>;
  /** Get combined statistics */
  getCombinedStats(): {
    frame: SchedulerStats;
    timer: SchedulerStats;
    concurrent: {
      activeTasks: number;
      completedTasks: number;
      failedTasks: number;
    };
  };
  /** Start all schedulers */
  start(): void;
  /** Stop all schedulers */
  stop(): void;
  /** Check if any scheduler is running */
  isRunning(): boolean;
}