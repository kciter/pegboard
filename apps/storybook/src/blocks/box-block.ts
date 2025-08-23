import { BlockData, BlockExtension } from '@pegboard/core';

export interface BoxBlockAttributes {
  text: string;
  color: string;
}

export class BoxBlock extends BlockExtension<BoxBlockAttributes> {
  readonly type = 'box';
  readonly defaultAttributes = { color: '#888', text: 'Box' } as const;

  render(data: BlockData<BoxBlockAttributes>, container: HTMLElement) {
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
    el.textContent = data.attributes.text;
    container.innerHTML = '';
    container.appendChild(el);
  }
}
