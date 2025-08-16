import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard, BlockExtension, BlockData } from '@pegboard/core';
import { ConstrainedBoxBlock, ConstrainedBoxAttrs } from './blocks/constrained-box-block';

const meta: Meta = {
  title: 'Getting Started/Constraints Size',
};
export default meta;

export const ConstraintsSize: StoryObj = {
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
    });

    pegboard.registerExtension(new ConstrainedBoxBlock());

    // 기본 제약을 가진 블럭 하나
    const id1 = pegboard.addBlock({
      type: 'box-constrained',
      position: { x: 2, y: 2, zIndex: 1 },
      size: { width: 4, height: 2 },
      attributes: { text: 'Box 1', color: 'hsl(200,70%,55%)' },
    });

    // 더 엄격한 제약을 가진 두 번째 블럭: min 3x2, max 5x3
    class StrictBox extends BlockExtension<ConstrainedBoxAttrs> {
      readonly type = 'box-constrained-strict';
      readonly defaultLayout = {
        x: 7,
        y: 2,
        width: 3,
        height: 2,
        minWidth: 3,
        minHeight: 2,
        maxWidth: 5,
        maxHeight: 3,
      } as const;
      readonly defaultAttributes = { color: 'hsl(10,70%,60%)', text: 'Strict' } as const;
      render(data: BlockData & { attributes: ConstrainedBoxAttrs }, container: HTMLElement) {
        const el = document.createElement('div');
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.borderRadius = '6px';
        el.style.background = data.attributes.color;
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.color = '#fff';
        el.style.fontWeight = 'bold';
        el.style.textAlign = 'center';
        el.innerHTML = `${data.attributes.text}<br/>(min 3x2, max 5x3)`;
        container.innerHTML = '';
        container.appendChild(el);
      }
    }
    pegboard.registerExtension(new StrictBox());

    pegboard.addBlock({
      type: 'box-constrained-strict',
      position: { x: 7, y: 2, zIndex: 2 },
      size: { width: 3, height: 2 },
      attributes: { text: 'Box 2', color: 'hsl(10,70%,60%)' },
    });

    return root;
  },
};
