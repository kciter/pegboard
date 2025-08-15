import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface GridArgs {
  columns: number;
  rows: number;
  rowHeight: number;
  gap: number;
  allowOverlap: boolean;
  autoArrange: boolean;
  arrangeAnimationMs: number;
}

const meta: Meta<GridArgs> = {
  title: 'Grid & Layout/Grid Controls',
  argTypes: {
    columns: { control: { type: 'range', min: 1, max: 24, step: 1 } },
    rows: { control: { type: 'range', min: 1, max: 20, step: 1 } },
    rowHeight: { control: { type: 'range', min: 24, max: 120, step: 2 } },
    gap: { control: { type: 'range', min: 0, max: 32, step: 1 } },
  },
  args: {
    columns: 12,
    rows: 10,
    rowHeight: 60,
    gap: 8,
  },
};
export default meta;

export const GridControls: StoryObj<GridArgs> = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: {
        columns: args.columns,
        rows: args.rows,
        rowHeight: args.rowHeight,
        gap: args.gap,
      },
      editable: true,
      allowOverlap: !!args.allowOverlap,
      autoArrange: !!args.autoArrange,
      arrangeAnimationMs: Math.max(0, Math.floor(args.arrangeAnimationMs)),
    });

    pegboard.registerPlugin(new BoxBlock());

    const randomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    pegboard.addBlock({
      type: 'box',
      position: { x: 1, y: 1, zIndex: 0 },
      size: { width: 3, height: 2 },
      attributes: {
        text: 'Box',
        color: randomColor(),
      },
    });

    return root;
  },
};
