// Simple singleton-style coordinator for cross-board drag/drop
class CrossBoardCoordinatorImpl {
  private boards = new Set<any>();

  register(board: any) {
    this.boards.add(board);
  }

  unregister(board: any) {
    this.boards.delete(board);
  }

  // Find the pegboard under the given viewport coordinates
  hitTest(clientX: number, clientY: number): any | null {
    for (const b of this.boards) {
      const el = (b as any).getContainer?.() as HTMLElement | undefined;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return b;
      }
    }
    return null;
  }

  list(): any[] {
    return Array.from(this.boards);
  }

  getByContainer(container: HTMLElement): any | null {
    for (const b of this.boards) {
      const el = (b as any).getContainer?.() as HTMLElement | undefined;
      if (el === container) return b;
    }
    return null;
  }
}

export const CrossBoardCoordinator = new CrossBoardCoordinatorImpl();
