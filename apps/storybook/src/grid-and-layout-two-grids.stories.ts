import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core/src/Pegboard';
import * as CoreTypes from '@pegboard/core/src/types';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Grid & Layout/Two Grids',
};
export default meta;

type Story = StoryObj;

function makeBoard(container: HTMLElement, cols: number, rows: number, title: string) {
  const header = document.createElement('div');
  header.textContent = title;
  header.style.marginBottom = '8px';
  const boardEl = document.createElement('div');
  boardEl.style.width = '100%';
  boardEl.style.height = '420px';
  boardEl.style.border = '1px solid #ddd';
  container.appendChild(header);
  container.appendChild(boardEl);

  const grid: CoreTypes.GridConfig = { columns: cols, rows, rowHeight: 56, gap: 8 };
  const board = new Pegboard({
    container: boardEl,
    grid,
    editable: true,
    dragOut: true,
    autoArrange: false,
    dragReflow: 'axis-shift',
    gridOverlayMode: 'always',
  });
  board.registerExtension(new BoxBlock());
  return board;
}

function seed(board: Pegboard, prefix: string, startY = 1) {
  const specs = [
    { w: 2, h: 2 },
    { w: 1, h: 3 },
    { w: 3, h: 1 },
    { w: 2, h: 1 },
  ];
  let x = 1;
  for (let i = 0; i < specs.length; i++) {
    const { w, h } = specs[i]!;
    board.addBlock({
      id: `${prefix}-${i + 1}`,
      type: 'box',
      position: { x, y: startY, zIndex: i + 1 } as any,
      size: { width: w, height: h } as any,
      attributes: { text: `${prefix} ${w}×${h}` } as any,
    } as any);
    x += w + 1;
  }
}

export const TwoGrids: Story = {
  render: () => {
    const root = document.createElement('div');
    root.style.display = 'grid';
    root.style.gridTemplateColumns = '1fr 1fr';
    root.style.gap = '16px';

    const left = document.createElement('div');
    const right = document.createElement('div');
    root.appendChild(left);
    root.appendChild(right);

    const boardA = makeBoard(left, 8, 12, 'Board A');
    const boardB = makeBoard(right, 8, 12, 'Board B');

    seed(boardA, 'A');
    seed(boardB, 'B', 2);

    return root;
  },
};
