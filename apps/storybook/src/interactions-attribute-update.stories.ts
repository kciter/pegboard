import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Interactions/Update Attributes',
};
export default meta;

export const UpdateAttributes: StoryObj = {
  render: () => {
    const root = document.createElement('div');
    root.style.width = '100%';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '8px';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Block';
    addBtn.style.padding = '6px 10px';

    // Form controls
    const textLabel = document.createElement('label');
    textLabel.textContent = 'Text:';
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = 'Enter text';
    textInput.style.width = '140px';

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color:';
    const colorInput = document.createElement('input');
    colorInput.type = 'text';
    colorInput.placeholder = '#RRGGBB or CSS color';
    colorInput.style.width = '140px';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = '#888888';

    const randomBtn = document.createElement('button');
    randomBtn.textContent = 'Random Color';
    randomBtn.style.padding = '6px 10px';

    const mkWrap = (label: HTMLElement, control: HTMLElement) => {
      const wrap = document.createElement('div');
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      wrap.appendChild(label);
      wrap.appendChild(control);
      return wrap;
    };

    toolbar.appendChild(addBtn);
    toolbar.appendChild(mkWrap(textLabel, textInput));
    toolbar.appendChild(mkWrap(colorLabel, colorInput));
    toolbar.appendChild(colorPicker);
    toolbar.appendChild(randomBtn);

    root.appendChild(toolbar);

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 8, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: false,
      autoArrange: false,
    });

    pegboard.registerPlugin(new BoxBlock());

    // Helpers
    const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randomColor = () =>
      `#${Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')}`;

    // Seed blocks
    const initial = ['#ffa940', '#36cfc9', '#597ef7'];
    for (let i = 0; i < 3; i++) {
      pegboard.addBlock({
        type: 'box',
        size: { width: 3, height: 2 },
        attributes: { text: `Box ${i + 1}`, color: initial[i % initial.length] },
      });
    }

    // Selection handling
    let selectedIds: string[] = [];
    const loadFirstSelectedIntoForm = () => {
      if (selectedIds.length === 0) return;
      const data = pegboard.getBlock(selectedIds[0]!);
      if (!data) return;
      const attrs: any = (data as any).attributes || {};
      textInput.value = attrs.text ?? '';
      colorInput.value = attrs.color ?? '#888888';
      // sync color picker if value is valid hex
      const hexMatch = /^#([0-9a-f]{6})$/i.exec(colorInput.value.trim());
      if (hexMatch) {
        colorPicker.value = `#${hexMatch[1]}`;
      }
    };

    // Apply changes immediately to all selected blocks
    const applyToSelection = () => {
      if (selectedIds.length === 0) return;
      const attrs = { text: textInput.value, color: colorInput.value } as const;
      for (const id of selectedIds) {
        pegboard.updateBlock(id, { attributes: attrs as any });
      }
    };

    pegboard.on('selection:changed', ({ ids }) => {
      selectedIds = ids;
      if (ids.length > 0) {
        loadFirstSelectedIntoForm();
      }
    });

    // Handlers
    addBtn.onclick = () => {
      const w = rand(2, 4);
      const h = rand(1, 3);
      pegboard.addBlock({
        type: 'box',
        size: { width: w, height: h },
        attributes: { text: 'Box', color: randomColor() },
      });
    };

    textInput.oninput = () => {
      applyToSelection();
    };

    colorInput.oninput = () => {
      const hexMatch = /^#([0-9a-f]{6})$/i.exec(colorInput.value.trim());
      if (hexMatch) colorPicker.value = `#${hexMatch[1]}`;
      applyToSelection();
    };

    colorPicker.oninput = () => {
      colorInput.value = colorPicker.value;
      applyToSelection();
    };

    randomBtn.onclick = () => {
      colorInput.value = randomColor();
      const hexMatch = /^#([0-9a-f]{6})$/i.exec(colorInput.value.trim());
      if (hexMatch) colorPicker.value = `#${hexMatch[1]}`;
      applyToSelection();
    };

    return root;
  },
};
