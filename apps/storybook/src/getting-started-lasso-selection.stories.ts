import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface LassoArgs {
  lassoSelection: boolean;
}

const meta: Meta<LassoArgs> = {
  title: 'Getting Started/Lasso Selection',
  argTypes: {
    lassoSelection: { control: 'boolean' },
  },
  args: {
    lassoSelection: true,
  },
};
export default meta;

export const LassoSelection: StoryObj<LassoArgs> = {
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
      lassoSelection: !!args.lassoSelection,
    });

    pegboard.registerExtension(new BoxBlock());

    const colors = [
      'hsl(210,70%,60%)',
      'hsl(140,70%,55%)',
      'hsl(20,80%,60%)',
      'hsl(270,60%,65%)',
      'hsl(330,70%,60%)',
      'hsl(30,80%,55%)',
    ];

    const blocks = [
      { x: 1, y: 1, w: 2, h: 2 },
      { x: 4, y: 1, w: 3, h: 2 },
      { x: 8, y: 1, w: 2, h: 3 },
      { x: 2, y: 5, w: 3, h: 2 },
      { x: 6, y: 4, w: 3, h: 2 },
      { x: 9, y: 6, w: 2, h: 2 },
    ];

    blocks.forEach((b, i) => {
      pegboard.addBlock({
        type: 'box',
        position: { x: b.x, y: b.y, zIndex: i + 1 },
        size: { width: b.w, height: b.h },
        attributes: { text: String.fromCharCode(65 + i), color: colors[i % colors.length] },
      });
    });

    return root;
  },
};
