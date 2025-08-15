import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface OverlapArgs {
  allowOverlap: boolean;
}

const meta: Meta<OverlapArgs> = {
  title: 'Grid & Layout/Allow Overlap',
  argTypes: {
    allowOverlap: { control: 'boolean' },
  },
  args: {
    allowOverlap: false,
  },
};
export default meta;

export const AllowOverlap: StoryObj<OverlapArgs> = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: !!args.allowOverlap,
    });

    pegboard.registerPlugin(new BoxBlock());

    const colors = ['hsl(210,70%,60%)', 'hsl(140,70%,55%)', 'hsl(20,80%,60%)'];

    pegboard.addBlock({
      type: 'box',
      position: { x: 2, y: 2, zIndex: 1 },
      size: { width: 3, height: 2 },
      attributes: { text: 'A', color: colors[0] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 6, y: 2, zIndex: 2 },
      size: { width: 4, height: 3 },
      attributes: { text: 'B', color: colors[1] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 4, y: 6, zIndex: 3 },
      size: { width: 3, height: 2 },
      attributes: { text: 'C', color: colors[2] },
    });

    const tip = document.createElement('p');
    tip.style.marginTop = '8px';
    tip.textContent = 'Toggle allowOverlap and try dragging blocks to overlap them.';
    root.appendChild(tip);

    return root;
  },
};
