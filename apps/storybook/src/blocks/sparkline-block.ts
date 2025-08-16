import { BlockData, BlockExtension } from '@pegboard/core';

export interface SparklineBlockAttributes {
  label: string;
  values: number[]; // 0..1 range preferred
  color?: string;
}

export class SparklineBlock extends BlockExtension<SparklineBlockAttributes> {
  readonly type = 'sparkline';
  readonly defaultAttributes = { label: 'Series', values: [] as number[] };

  render(data: BlockData & { attributes: SparklineBlockAttributes }, container: HTMLElement) {
    const root = document.createElement('div');
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.padding = '10px';
    root.style.boxSizing = 'border-box';
    root.style.border = '1px solid #444';

    const title = document.createElement('div');
    title.textContent = data.attributes.label;
    title.style.fontSize = '12px';
    title.style.marginBottom = '4px';

    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 80;
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    root.appendChild(title);
    root.appendChild(canvas);

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = data.attributes.color || 'hsl(205,70%,55%)';
    ctx.lineWidth = 2;

    const values = (data.attributes.values || []).slice(-60);
    if (values.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < values.length; i++) {
        const x = (i / (values.length - 1)) * canvas.width;
        const vv = values[i];
        const v = typeof vv === 'number' && isFinite(vv) ? Math.max(0, Math.min(1, vv)) : 0;
        const y = canvas.height - v * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    container.innerHTML = '';
    container.appendChild(root);
  }
}
