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
  const base: Array<Partial<CoreTypes.BlockData>> = [
    {
      type: 'box',
      position: { x: 2, y: 1, zIndex: 1 },
      size: { width: 2, height: 2 },
      attributes: {},
    },
    {
      type: 'box',
      position: { x: 5, y: 1, zIndex: 2 },
      size: { width: 3, height: 1 },
      attributes: {},
    },
    {
      type: 'box',
      position: { x: 1, y: 4, zIndex: 3 },
      size: { width: 1, height: 2 },
      attributes: {},
    },
    {
      type: 'box',
      position: { x: 6, y: 3, zIndex: 4 },
      size: { width: 2, height: 2 },
      attributes: {},
    },
    {
      type: 'box',
      position: { x: 3, y: 6, zIndex: 5 },
      size: { width: 2, height: 1 },
      attributes: {},
    },
  ];
  base.forEach((b, i) =>
    board.addBlock({
      id: `blk-${i + 1}`,
      type: 'box',
      position: b.position as any,
      size: b.size as any,
      attributes: {},
    }),
  );
}

export const AutoArrange: Story = {
  render: (args: any) => {
    const { root, container } = createContainer();

    const grid: CoreTypes.GridConfig = { columns: 8, rows: 8, rowHeight: 56, gap: 8 };

    const board = new Pegboard({
      container,
      grid,
      editable: true,
      // allowOverlap 토글에 따라 자동 배치가 켜져 있어도 동작하지 않게끔 구현되어 있음
      allowOverlap: !!args.allowOverlap,
      autoArrange: !!args.autoArrange,
      autoArrangeStrategy: args.autoArrangeStrategy,
      arrangeAnimationMs: args.arrangeAnimationMs,
      gridOverlayMode: 'active',
      dragReflow: 'axis-shift',
    });

    board.registerExtension(new BoxBlock());

    seedBlocks(board);

    // 안내 텍스트
    const info = document.createElement('div');
    info.style.marginTop = '12px';
    info.style.fontSize = '12px';
    info.style.color = '#666';
    info.innerHTML = `
      <div>Drag blocks around. On drop, auto arrange will pack them to top-left.</div>
      <div>Note: When allowOverlap is true, auto arrange is skipped.</div>
    `;
    root.appendChild(info);

    return root;
  },
  argTypes: {
    autoArrange: { control: 'boolean' },
    allowOverlap: { control: 'boolean' },
    autoArrangeStrategy: { control: 'select', options: ['top-left'] },
    arrangeAnimationMs: { control: { type: 'number', min: 0, step: 20 } },
  },
  args: {
    autoArrange: true,
    allowOverlap: false,
    autoArrangeStrategy: 'top-left',
    arrangeAnimationMs: 160,
  },
};
