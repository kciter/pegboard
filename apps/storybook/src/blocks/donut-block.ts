import { BlockData, BlockExtension } from '@pegboard/core';

export interface DonutBlockAttributes {
  label: string;
  percent: number; // 0..100
  color?: string;
  trackColor?: string;
}

export class DonutBlock extends BlockExtension<DonutBlockAttributes> {
  readonly type = 'donut';
  readonly defaultAttributes = { label: 'Metric', percent: 0 } as const;

  render(data: BlockData & { attributes: DonutBlockAttributes }, container: HTMLElement) {
    const size = 120;
    const stroke = 14;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const pct = Math.max(0, Math.min(100, data.attributes.percent));
    const offset = circumference * (1 - pct / 100);

    const root = document.createElement('div');
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'center';
    root.style.gap = '8px';
    root.style.border = '1px solid #444';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', '80%');
    svg.setAttribute('height', '80%');

    const cx = size / 2;
    const cy = size / 2;

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', String(cx));
    track.setAttribute('cy', String(cy));
    track.setAttribute('r', String(radius));
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', data.attributes.trackColor || 'rgba(255,255,255,0.2)');
    track.setAttribute('stroke-width', String(stroke));

    const progress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progress.setAttribute('cx', String(cx));
    progress.setAttribute('cy', String(cy));
    progress.setAttribute('r', String(radius));
    progress.setAttribute('fill', 'none');
    progress.setAttribute('stroke', data.attributes.color || 'hsl(205,70%,50%)');
    progress.setAttribute('stroke-width', String(stroke));
    progress.setAttribute('stroke-linecap', 'round');
    progress.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    progress.setAttribute('stroke-dasharray', String(circumference));
    progress.setAttribute('stroke-dashoffset', String(offset));

    const centerText = document.createElement('div');
    centerText.style.position = 'absolute';

    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';

    const pctText = document.createElement('div');
    pctText.textContent = `${pct.toFixed(0)}%`;
    pctText.style.position = 'absolute';
    pctText.style.left = '50%';
    pctText.style.top = '50%';
    pctText.style.transform = 'translate(-50%, -50%)';
    pctText.style.color = '#fff';
    pctText.style.fontWeight = 'bold';
    pctText.style.fontSize = '20px';

    wrapper.appendChild(svg);
    svg.appendChild(track);
    svg.appendChild(progress);
    wrapper.appendChild(pctText);

    const label = document.createElement('div');
    label.textContent = data.attributes.label;
    label.style.fontSize = '12px';

    root.appendChild(label);
    root.appendChild(wrapper);

    container.innerHTML = '';
    container.appendChild(root);
  }
}
