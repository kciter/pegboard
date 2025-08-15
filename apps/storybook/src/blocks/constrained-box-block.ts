import { BlockData, BlockExtension } from '@pegboard/core';

export interface ConstrainedBoxAttrs {
  text: string;
  color: string;
}

export class ConstrainedBoxBlock extends BlockExtension<ConstrainedBoxAttrs> {
  readonly type = 'box-constrained';
  // 기본 크기 + 최소/최대 크기 제약
  readonly defaultLayout = {
    x: 2,
    y: 2,
    width: 4,
    height: 2,
    minWidth: 2,
    minHeight: 1,
    maxWidth: 8,
    maxHeight: 4,
  } as const;
  readonly defaultAttributes = { color: 'hsl(200,70%,55%)', text: 'Resizable' } as const;

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
    el.innerHTML = `${data.attributes.text}<br/>(min 2x1, max 8x4)`;
    container.innerHTML = '';
    container.appendChild(el);
  }
}
