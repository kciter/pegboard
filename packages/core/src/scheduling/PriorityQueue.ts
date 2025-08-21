import type { Task, IPriorityQueue } from './types';
import { TaskPriority } from './types';

/**
 * Priority queue implementation using binary heap
 */
export class PriorityQueue implements IPriorityQueue {
  private heap: Array<{ task: Task; priority: TaskPriority }> = [];

  enqueue<T>(task: Task<T>): void {
    this.enqueueWithPriority(task, TaskPriority.NORMAL);
  }

  enqueueWithPriority<T>(task: Task<T>, priority: TaskPriority): void {
    const item = { task, priority };
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): Task | null {
    if (this.isEmpty()) {
      return null;
    }

    if (this.heap.length === 1) {
      return this.heap.pop()!.task;
    }

    const root = this.heap[0]?.task;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return root || null;
  }

  peek(): Task | null {
    return this.isEmpty() ? null : this.heap[0]?.task || null;
  }

  size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  clear(): void {
    this.heap = [];
  }

  toArray(): Task[] {
    return this.heap
      .slice()
      .sort((a, b) => b.priority - a.priority)
      .map(item => item.task);
  }

  // Private heap operations

  private bubbleUp(index: number): void {
    if (index === 0) return;

    const parentIndex = Math.floor((index - 1) / 2);
    if (this.hasHigherPriority(index, parentIndex)) {
      this.swap(index, parentIndex);
      this.bubbleUp(parentIndex);
    }
  }

  private bubbleDown(index: number): void {
    const leftChild = 2 * index + 1;
    const rightChild = 2 * index + 2;
    let highest = index;

    if (leftChild < this.heap.length && this.hasHigherPriority(leftChild, highest)) {
      highest = leftChild;
    }

    if (rightChild < this.heap.length && this.hasHigherPriority(rightChild, highest)) {
      highest = rightChild;
    }

    if (highest !== index) {
      this.swap(index, highest);
      this.bubbleDown(highest);
    }
  }

  private hasHigherPriority(index1: number, index2: number): boolean {
    const item1 = this.heap[index1];
    const item2 = this.heap[index2];

    if (!item1 || !item2) {
      return false;
    }

    // Higher priority number = higher priority
    if (item1.priority !== item2.priority) {
      return item1.priority > item2.priority;
    }

    // If same priority, older tasks (lower createdAt) have higher priority
    return item1.task.context.createdAt < item2.task.context.createdAt;
  }

  private swap(index1: number, index2: number): void {
    const temp = this.heap[index1];
    const temp2 = this.heap[index2];
    if (temp && temp2) {
      this.heap[index1] = temp2;
      this.heap[index2] = temp;
    }
  }

  // Debug helpers

  /**
   * Validate heap property (for testing)
   */
  isValidHeap(): boolean {
    for (let i = 0; i < Math.floor(this.heap.length / 2); i++) {
      const leftChild = 2 * i + 1;
      const rightChild = 2 * i + 2;

      if (leftChild < this.heap.length && this.hasHigherPriority(leftChild, i)) {
        return false;
      }

      if (rightChild < this.heap.length && this.hasHigherPriority(rightChild, i)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get heap visualization (for debugging)
   */
  getHeapVisualization(): any[] {
    return this.heap.map((item, index) => ({
      index,
      taskName: item.task.context.name,
      priority: item.priority,
      createdAt: item.task.context.createdAt,
    }));
  }
}