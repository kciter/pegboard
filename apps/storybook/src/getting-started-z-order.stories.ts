import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Getting Started/Z Order',
};
export default meta;

export const ZOrder: StoryObj = {
  render: () => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '8px';

    const frontBtn = document.createElement('button');
    frontBtn.textContent = 'Bring To Front';
    frontBtn.style.padding = '6px 10px';
    frontBtn.disabled = true;

    const fwdBtn = document.createElement('button');
    fwdBtn.textContent = 'Bring Forward';
    fwdBtn.style.padding = '6px 10px';
    fwdBtn.disabled = true;

    const backBtn = document.createElement('button');
    backBtn.textContent = 'Send To Back';
    backBtn.style.padding = '6px 10px';
    backBtn.disabled = true;

    const bwdBtn = document.createElement('button');
    bwdBtn.textContent = 'Send Backward';
    bwdBtn.style.padding = '6px 10px';
    bwdBtn.disabled = true;

    toolbar.appendChild(frontBtn);
    toolbar.appendChild(fwdBtn);
    toolbar.appendChild(bwdBtn);
    toolbar.appendChild(backBtn);
    root.appendChild(toolbar);

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: true, // 겹쳐 놓고 z-order 변경을 눈에 띄게 보기 위함
      autoArrange: false,
    });

    pegboard.registerExtension(new BoxBlock());

    // 선택 상태에 따라 버튼 활성화
    let selected: string | null = null;
    const updateButtons = () => {
      const enabled = !!selected;
      frontBtn.disabled = !enabled;
      backBtn.disabled = !enabled;
      fwdBtn.disabled = !enabled;
      bwdBtn.disabled = !enabled;
    };
    pegboard.on('block:selected', ({ block }) => {
      selected = block ? block.id : null;
      updateButtons();
    });

    const colors = ['#ffd666', '#5cdbd3', '#85a5ff'];
    const base = { x: 4, y: 3 };
    for (let i = 0; i < 3; i++) {
      pegboard.addBlock({
        type: 'box',
        position: { x: base.x + i, y: base.y + i, zIndex: 1 },
        size: { width: 4, height: 3 },
        attributes: { text: `Layer ${i + 1}`, color: colors[i % colors.length] },
      });
    }

    frontBtn.onclick = () => {
      if (!selected) return;
      pegboard.bringToFront(selected);
    };

    backBtn.onclick = () => {
      if (!selected) return;
      pegboard.sendToBack(selected);
    };

    fwdBtn.onclick = () => {
      if (!selected) return;
      pegboard.bringForward(selected);
    };

    bwdBtn.onclick = () => {
      if (!selected) return;
      pegboard.sendBackward(selected);
    };

    return root;
  },
};
