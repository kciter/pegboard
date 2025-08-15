import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface ReflowArgs {
  dragReflow: 'none' | 'shift-down' | 'pack-top';
  allowOverlap: boolean;
}

const meta: Meta<ReflowArgs> = {
  title: 'Grid & Layout/Drag Reflow',
  argTypes: {
    dragReflow: {
      control: { type: 'radio' },
      options: ['none', 'shift-down', 'pack-top'],
    },
    allowOverlap: { control: 'boolean' },
  },
  args: {
    dragReflow: 'shift-down',
    allowOverlap: false,
  },
};
export default meta;

export const DragReflow: StoryObj<ReflowArgs> = {
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
      dragReflow: args.dragReflow,
    });

    pegboard.registerPlugin(new BoxBlock());

    const colors = [
      'hsl(210,70%,60%)',
      'hsl(140,70%,55%)',
      'hsl(20,80%,60%)',
      'hsl(270,60%,65%)',
      'hsl(330,70%,60%)',
      'hsl(30,80%,55%)',
    ];

    // 테스트용 블록 배치: 일부는 인접하게 두어 끼워넣기 효과가 잘 보이도록
    pegboard.addBlock({
      type: 'box',
      position: { x: 2, y: 2, zIndex: 1 },
      size: { width: 3, height: 2 },
      attributes: { text: 'A', color: colors[0] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 6, y: 2, zIndex: 2 },
      size: { width: 4, height: 2 },
      attributes: { text: 'B', color: colors[1] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 3, y: 5, zIndex: 3 },
      size: { width: 2, height: 2 },
      attributes: { text: 'C', color: colors[2] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 8, y: 5, zIndex: 4 },
      size: { width: 3, height: 1 },
      attributes: { text: 'D', color: colors[3] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 1, y: 7, zIndex: 5 },
      size: { width: 2, height: 3 },
      attributes: { text: 'E', color: colors[4] },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 5, y: 7, zIndex: 6 },
      size: { width: 3, height: 2 },
      attributes: { text: 'F', color: colors[5] },
    });

    const tip = document.createElement('p');
    tip.style.marginTop = '8px';
    tip.style.font =
      '12px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    tip.style.color = '#666';
    tip.textContent =
      '블록을 다른 블록 사이로 드래그해 보세요. dragReflow가 none이면 충돌로 막히고, shift-down이면 주변 블록이 아래로 비켜납니다. allowOverlap=true면 재배치가 비활성화됩니다.';
    root.appendChild(tip);

    return root;
  },
};
