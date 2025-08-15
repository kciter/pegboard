import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface AutoArrangeArgs {
  autoArrange: boolean;
  arrangeAnimationMs: number;
}

const meta: Meta<AutoArrangeArgs> = {
  title: 'Grid & Layout/Auto Arrange',
  argTypes: {
    autoArrange: { control: 'boolean' },
    arrangeAnimationMs: { control: { type: 'range', min: 0, max: 800, step: 20 } },
  },
  args: {
    autoArrange: true,
    arrangeAnimationMs: 220,
  },
};
export default meta;

export const AutoArrange: StoryObj<AutoArrangeArgs> = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: false,
      autoArrange: !!args.autoArrange,
      arrangeAnimationMs: Math.max(0, Math.floor(args.arrangeAnimationMs)),
    });

    pegboard.registerPlugin(new BoxBlock());

    const colors = [
      'hsl(210,70%,60%)',
      'hsl(140,70%,55%)',
      'hsl(20,80%,60%)',
      'hsl(270,60%,65%)',
      'hsl(330,70%,60%)',
    ];

    // 일부는 겹치게 배치해서 auto arrange 효과를 보여줌
    pegboard.addBlock({
      type: 'box',
      position: { x: 1, y: 1, zIndex: 1 },
      size: { width: 3, height: 2 },
      attributes: { text: 'A', color: colors[0] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 2, y: 1, zIndex: 2 },
      size: { width: 4, height: 3 },
      attributes: { text: 'B', color: colors[1] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 4, y: 1, zIndex: 3 },
      size: { width: 2, height: 2 },
      attributes: { text: 'C', color: colors[2] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 6, y: 2, zIndex: 4 },
      size: { width: 3, height: 1 },
      attributes: { text: 'D', color: colors[3] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 3, y: 2, zIndex: 5 },
      size: { width: 2, height: 3 },
      attributes: { text: 'E', color: colors[4] },
    });

    // 안내 텍스트
    const tip = document.createElement('p');
    tip.style.marginTop = '8px';
    tip.textContent = 'Toggle autoArrange and tune animation speed to see packing.';
    root.appendChild(tip);

    return root;
  },
};
