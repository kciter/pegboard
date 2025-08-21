import { EventEmitter } from '../EventEmitter';
import { generateId } from '../utils';
import type { 
  IConcurrentTaskManager, 
  TaskFunction, 
  TaskContext, 
  TaskResult
} from './types';
import { TaskPriority } from './types';

/**
 * Manages concurrent execution of tasks with various strategies
 */
export class ConcurrentTaskManager extends EventEmitter implements IConcurrentTaskManager {
  private activeTasks = new Set<string>();
  private completedTasks = 0;
  private failedTasks = 0;

  constructor(private defaultTimeout: number = 10000) {
    super();
  }

  async executeConcurrent<T>(
    tasks: TaskFunction<T>[], 
    concurrencyLimit: number
  ): Promise<TaskResult<T>[]> {
    if (tasks.length === 0) return [];
    if (concurrencyLimit <= 0) throw new Error('Concurrency limit must be positive');

    const results: TaskResult<T>[] = [];
    const executing = new Set<Promise<void>>();
    let taskIndex = 0;

    const executeNext = async (): Promise<void> => {
      if (taskIndex >= tasks.length) return;

      const currentIndex = taskIndex++;
      const task = tasks[currentIndex];
      const taskId = generateId();
      
      this.activeTasks.add(taskId);
      
      const promise = this.executeTaskWithResult(task, {
        id: taskId,
        name: `concurrent-task-${currentIndex}`,
        priority: TaskPriority.NORMAL,
        createdAt: performance.now(),
      }).then(result => {
        results[currentIndex] = result;
        this.activeTasks.delete(taskId);
        
        if (result.success) {
          this.completedTasks++;
        } else {
          this.failedTasks++;
        }

        (this as any).emit('task:completed', result);
      });

      executing.add(promise);
      
      // Remove from executing set when done
      promise.finally(() => executing.delete(promise));

      // Continue with next task if under concurrency limit
      if (executing.size < concurrencyLimit && taskIndex < tasks.length) {
        await executeNext();
      }
    };

    // Start initial batch of tasks
    const initialBatch = Math.min(concurrencyLimit, tasks.length);
    const initialPromises = Array.from({ length: initialBatch }, () => executeNext());
    
    // Wait for all initial tasks to start
    await Promise.all(initialPromises);

    // Wait for remaining tasks to complete
    while (executing.size > 0) {
      await Promise.race(executing);
      
      // Start more tasks if available and under limit
      while (executing.size < concurrencyLimit && taskIndex < tasks.length) {
        await executeNext();
      }
    }

    (this as any).emit('batch:completed', {
      totalTasks: tasks.length,
      completed: results.filter(r => r && r.success).length,
      failed: results.filter(r => r && !r.success).length,
      concurrencyLimit,
    });

    return results;
  }

  async executeParallel<T>(tasks: TaskFunction<T>[]): Promise<TaskResult<T>[]> {
    if (tasks.length === 0) return [];

    const promises = tasks.map(async (task, index) => {
      const taskId = generateId();
      this.activeTasks.add(taskId);

      const result = await this.executeTaskWithResult(task, {
        id: taskId,
        name: `parallel-task-${index}`,
        priority: TaskPriority.NORMAL,
        createdAt: performance.now(),
      });

      this.activeTasks.delete(taskId);
      
      if (result.success) {
        this.completedTasks++;
      } else {
        this.failedTasks++;
      }

      (this as any).emit('task:completed', result);
      return result;
    });

    const results = await Promise.all(promises);

    (this as any).emit('batch:completed', {
      totalTasks: tasks.length,
      completed: results.filter(r => r && r.success).length,
      failed: results.filter(r => r && !r.success).length,
      strategy: 'parallel',
    });

    return results;
  }

  async executeSequential<T>(tasks: TaskFunction<T>[]): Promise<TaskResult<T>[]> {
    if (tasks.length === 0) return [];

    const results: TaskResult<T>[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const taskId = generateId();
      
      this.activeTasks.add(taskId);

      const result = await this.executeTaskWithResult(task, {
        id: taskId,
        name: `sequential-task-${i}`,
        priority: TaskPriority.NORMAL,
        createdAt: performance.now(),
      });

      this.activeTasks.delete(taskId);
      results.push(result);
      
      if (result.success) {
        this.completedTasks++;
      } else {
        this.failedTasks++;
      }

      (this as any).emit('task:completed', result);
    }

    (this as any).emit('batch:completed', {
      totalTasks: tasks.length,
      completed: results.filter(r => r && r.success).length,
      failed: results.filter(r => r && !r.success).length,
      strategy: 'sequential',
    });

    return results;
  }

  async executeBatched<T>(
    tasks: TaskFunction<T>[], 
    batchSize: number,
    batchDelay: number = 0
  ): Promise<TaskResult<T>[]> {
    if (tasks.length === 0) return [];
    if (batchSize <= 0) throw new Error('Batch size must be positive');

    const results: TaskResult<T>[] = [];
    const batches: TaskFunction<T>[][] = [];

    // Split tasks into batches
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }

    // Execute batches sequentially with delay
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      if (!batch) continue;
      
      (this as any).emit('batch:started', {
        batchIndex,
        batchSize: batch.length,
        totalBatches: batches.length,
      });

      // Execute batch in parallel
      const batchResults = await this.executeParallel(batch);
      results.push(...batchResults);

      (this as any).emit('batch:finished', {
        batchIndex,
        batchSize: batch.length,
        completed: batchResults.filter(r => r && r.success).length,
        failed: batchResults.filter(r => r && !r.success).length,
      });

      // Add delay between batches (except for the last one)
      if (batchDelay > 0 && batchIndex < batches.length - 1) {
        await this.delay(batchDelay);
      }
    }

    (this as any).emit('batch:completed', {
      totalTasks: tasks.length,
      completed: results.filter(r => r && r.success).length,
      failed: results.filter(r => r && !r.success).length,
      strategy: 'batched',
      batchSize,
      totalBatches: batches.length,
    });

    return results;
  }

  // Utility methods

  getActiveTasks(): string[] {
    return Array.from(this.activeTasks);
  }

  getStats(): {
    activeTasks: number;
    completedTasks: number;
    failedTasks: number;
  } {
    return {
      activeTasks: this.activeTasks.size,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
    };
  }

  clearStats(): void {
    this.completedTasks = 0;
    this.failedTasks = 0;
  }

  // Private methods

  private async executeTaskWithResult<T>(
    task: TaskFunction<T>, 
    context: TaskContext
  ): Promise<TaskResult<T>> {
    const startTime = performance.now();
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Task '${context.name}' timed out after ${this.defaultTimeout}ms`));
        }, this.defaultTimeout);
      });

      // Execute task with timeout
      const resultPromise = Promise.resolve(task(context));
      const result = await Promise.race([resultPromise, timeoutPromise]);

      const duration = performance.now() - startTime;

      return {
        context,
        success: true,
        result,
        duration,
        completedAt: performance.now(),
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      const taskError = error instanceof Error ? error : new Error(String(error));

      return {
        context,
        success: false,
        error: taskError,
        duration,
        completedAt: performance.now(),
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}