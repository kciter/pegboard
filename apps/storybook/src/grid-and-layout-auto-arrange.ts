import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core/src/Pegboard';
import * as CoreTypes from '@pegboard/core/src/types';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Grid & Layout/Auto Arrange',
};
export default meta;

type Story = StoryObj;

function createContainer() {
  const root = document.createElement('div');
  root.style.width = '100%';
  root.style.height = '520px';
  root.style.padding = '12px';
  root.style.boxSizing = 'border-box';
  const container = document.createElement('div');
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.padding = '12px';
  container.style.boxSizing = 'border-box';
  root.appendChild(container);
  return { root, container };
}

function seedBlocks(board: Pegboard) {
  type S = { w: number; h: number };
  const preset: S[] = [
    { w: 3, h: 1 },
    { w: 3, h: 2 },
    { w: 1, h: 3 },
    { w: 2, h: 3 },
    { w: 2, h: 1 },
    { w: 1, h: 2 },
    { w: 3, h: 3 },
    { w: 2, h: 2 },
    { w: 4, h: 1 },
    { w: 1, h: 4 },
    { w: 1, h: 1 },
    { w: 2, h: 4 },
    { w: 4, h: 2 },
    { w: 1, h: 2 },
  ];

  const colorFor = (w: number, h: number) => `hsl(${(w * 60 + h * 25) % 360} 70% 50%)`;

  let xCursor = 1;
  let yCursor = 1;
  let rowMaxH = 0;
  const COLS = 8; // story grid columns
  preset.forEach(({ w, h }, i) => {
    // 줄바꿈 필요 시 수행(폭 고려)
    if (xCursor + w - 1 > COLS) {
      xCursor = 1;
      yCursor += Math.max(1, rowMaxH) + 1; // 한 줄 내려가고 1칸 여백
      rowMaxH = 0;
    }
    const id = `blk-${i + 1}`;
    board.addBlock({
      id,
      type: 'box',
      position: { x: xCursor, y: yCursor, zIndex: i + 1 } as any,
      size: { width: w, height: h } as any,
      attributes: { text: `#${i + 1} ${w}×${h}`, color: colorFor(w, h) } as any,
    } as any);
    xCursor += w + 1;
    rowMaxH = Math.max(rowMaxH, h);
  });
}

export const AutoArrange: Story = {
  render: (args: any) => {
    const { root, container } = createContainer();

    const grid: CoreTypes.GridConfig = { columns: 8, rows: 16, rowHeight: 56, gap: 8 };

    const board = new Pegboard({
      container,
      grid,
      editable: true,
      // allowOverlap 토글에 따라 자동 배치가 켜져 있어도 동작하지 않게끔 구현되어 있음
      allowOverlap: !!args.allowOverlap,
      autoArrange: !!args.autoArrange,
      autoArrangeStrategy: args.autoArrangeStrategy,
      arrangeAnimationMs: args.arrangeAnimationMs,
      dragReflow: 'axis-shift',
    });

    board.registerExtension(new BoxBlock());

    seedBlocks(board);

    return root;
  },
  argTypes: {
    autoArrange: { control: 'boolean' },
    allowOverlap: { control: 'boolean' },
    autoArrangeStrategy: {
      control: 'select',
      options: ['top-left', 'masonry', 'by-row', 'by-column'],
    },
    arrangeAnimationMs: { control: { type: 'number', min: 0, step: 20 } },
  },
  args: {
    autoArrange: true,
    allowOverlap: false,
    autoArrangeStrategy: 'top-left',
    arrangeAnimationMs: 160,
  },
};
