import { BlockData, BlockExtension } from '@pegboard/core';

export interface NoteBlockAttributes {
  title: string;
  body: string;
  hue?: number;
}

export class NoteBlock extends BlockExtension<NoteBlockAttributes> {
  readonly type = 'note';
  readonly defaultLayout = { x: 1, y: 1, width: 4, height: 3 } as const;
  readonly defaultAttributes = {
    title: 'Note',
    body: 'Double-click this block to edit. Click outside to exit.',
    hue: 210,
  } as const;
  readonly allowEditMode = true;

  render(
    data: BlockData & { attributes: NoteBlockAttributes },
    container: HTMLElement,
    isEditorMode: boolean,
  ) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.height = '100%';
    wrap.style.padding = '10px 12px';
    wrap.style.boxSizing = 'border-box';
    wrap.style.backgroundColor = '#f0f0f0';
    wrap.style.borderRadius = '8px';
    wrap.style.overflow = 'hidden';

    const title = document.createElement('div');
    title.className = 'note-title';
    title.textContent = data.attributes.title;
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';

    const body = document.createElement('div');
    body.className = 'note-body';
    body.textContent = data.attributes.body;
    body.style.whiteSpace = 'pre-wrap';
    body.style.lineHeight = '1.4';
    body.style.flex = '1';
    body.style.overflow = 'auto';

    // subtle accent
    const hue = data.attributes.hue ?? 210;
    wrap.style.borderLeft = `3px solid hsl(${hue},65%,60%)`;

    wrap.appendChild(title);
    wrap.appendChild(body);
    container.innerHTML = '';
    container.appendChild(wrap);
  }

  onEnterEditMode(data: BlockData & { attributes: NoteBlockAttributes }, container: HTMLElement) {
    const title = container.querySelector('.note-title') as HTMLElement | null;
    const body = container.querySelector('.note-body') as HTMLElement | null;
    if (title) {
      title.contentEditable = 'true';
      title.style.outline = 'none';
    }
    if (body) {
      body.contentEditable = 'true';
      body.style.outline = 'none';
    }
    // focus title end
    setTimeout(() => {
      if (!title) return;
      title.focus();
      const range = document.createRange();
      range.selectNodeContents(title);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 0);
  }

  onExitEditMode(data: BlockData & { attributes: NoteBlockAttributes }, container: HTMLElement) {
    const title = container.querySelector('.note-title') as HTMLElement | null;
    const body = container.querySelector('.note-body') as HTMLElement | null;
    if (title) {
      title.contentEditable = 'false';
      data.attributes.title = title.innerText;
    }
    if (body) {
      body.contentEditable = 'false';
      data.attributes.body = body.innerText;
    }
  }
}
