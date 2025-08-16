import { Pegboard, BlockData, BlockExtension } from '@pegboard/core';

let pegboard: Pegboard;
let selectedBlockId: string | null = null;

class TextBlockExtension extends BlockExtension<{ content: string }> {
  readonly type = 'text';
  readonly defaultLayout = { x: 1, y: 1, width: 3, height: 2, minWidth: 2, minHeight: 2 } as const;
  readonly defaultAttributes = { content: 'Text Block' } as const;
  render(data: BlockData & { attributes: { content: string } }, container: HTMLElement) {
    container.innerHTML = `<div class="demo-block">${data.attributes.content ?? ''}</div>`;
  }
}

function init() {
  const root = document.getElementById('pegboard-root');
  if (!root) return;

  pegboard = new Pegboard({
    container: root,
    grid: { columns: 12, rowHeight: 60, gap: 8 },
    mode: 'editor',
    allowOverlap: false,
    autoArrange: false,
    arrangeAnimationMs: 220,
  });

  pegboard.registerExtension(new TextBlockExtension());

  // Seed blocks
  pegboard.addBlock({ type: 'text', attributes: { content: 'Hello from Text Block' } as any });

  attachUI();
  refreshList();
  setupInspector();
}

function attachUI() {
  const addTextBtn = document.getElementById('add-text');
  const overlapToggle = document.getElementById('toggle-overlap') as HTMLInputElement | null;
  const autoArrangeToggle = document.getElementById(
    'toggle-auto-arrange',
  ) as HTMLInputElement | null;
  const arrangeMsInput = document.getElementById('arrange-ms') as HTMLInputElement | null;

  addTextBtn?.addEventListener('click', () => {
    pegboard.addBlock({ type: 'text', attributes: { content: 'New Text' } as any });
  });
  overlapToggle?.addEventListener('change', () => {
    pegboard.setAllowOverlap(overlapToggle.checked);
  });
  autoArrangeToggle?.addEventListener('change', () => {
    pegboard.setAutoArrange(!!autoArrangeToggle.checked);
  });
  arrangeMsInput?.addEventListener('change', () => {
    const v = parseInt(arrangeMsInput.value, 10);
    if (!Number.isNaN(v)) pegboard.setArrangeAnimationMs(v);
  });

  pegboard.on('block:added', refreshList);
  pegboard.on('block:removed', refreshList);
  pegboard.on('block:updated', refreshList);
  pegboard.on('block:moved', refreshList);
  pegboard.on('block:resized', refreshList);
  pegboard.on('block:selected', ({ block }) => {
    selectedBlockId = block ? block.id : null;
    updateInspector();
  });
}

function refreshList() {
  const list = document.getElementById('block-list');
  const countEl = document.getElementById('count');
  if (!list || !countEl) return;
  const blocks = pegboard.getAllBlocks();
  countEl.textContent = String(blocks.length);
  list.innerHTML = blocks
    .map(
      (b: BlockData) =>
        `<li>${b.type} @ (${b.gridPosition.column},${b.gridPosition.row}) span(${b.gridSize.columnSpan}x${b.gridSize.rowSpan})</li>`,
    )
    .join('');
}

function setupInspector() {
  const inspector = document.getElementById('inspector');
  if (!inspector) return;
  inspector.innerHTML = `
    <h3>Inspector</h3>
    <div id="inspector-empty">Select a block</div>
    <div id="inspector-body" style="display:none; display:flex; flex-direction:column; gap:6px;">
      <div><strong id="insp-type"></strong> <span id="insp-id" style="font-size:11px;color:#888"></span></div>
      <label>Content <input id="insp-content" type="text" style="width:100%" /></label>
      <div style="display:flex; gap:4px; flex-wrap:wrap;">
        <label style="flex:1 1 45%">Column <input id="insp-col" type="number" min="1" style="width:100%" /></label>
        <label style="flex:1 1 45%">Row <input id="insp-row" type="number" min="1" style="width:100%" /></label>
        <label style="flex:1 1 45%">Col Span <input id="insp-colspan" type="number" min="1" style="width:100%" /></label>
        <label style="flex:1 1 45%">Row Span <input id="insp-rowspan" type="number" min="1" style="width:100%" /></label>
      </div>
      <div style="display:flex; gap:6px;">
        <button id="insp-apply">Apply</button>
        <button id="insp-delete" style="margin-left:auto;">Delete</button>
      </div>
    </div>
  `;
  inspector.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (!selectedBlockId) return;
    if (target.id === 'insp-content') {
      // live preview content only
      pegboard.updateBlock(selectedBlockId, { attributes: { content: target.value } as any });
      updateInspector(true);
    }
  });
  inspector.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!selectedBlockId) return;
    if (target.id === 'insp-apply') {
      applyInspector();
    } else if (target.id === 'insp-delete') {
      pegboard.removeBlock(selectedBlockId);
      selectedBlockId = null;
      updateInspector();
    }
  });
}

function updateInspector(skipFocus?: boolean) {
  const body = document.getElementById('inspector-body');
  const empty = document.getElementById('inspector-empty');
  if (!body || !empty) return;
  if (!selectedBlockId) {
    body.style.display = 'none';
    empty.style.display = '';
    return;
  }
  const data = pegboard.getBlock(selectedBlockId);
  if (!data) return;
  body.style.display = '';
  empty.style.display = 'none';
  (document.getElementById('insp-type') as HTMLElement).textContent = data.type;
  (document.getElementById('insp-id') as HTMLElement).textContent = `#${data.id}`;
  const contentInput = document.getElementById('insp-content') as HTMLInputElement;
  if (contentInput && !skipFocus) contentInput.value = data.attributes.content ?? '';
  (document.getElementById('insp-col') as HTMLInputElement).value = String(
    data.gridPosition.column,
  );
  (document.getElementById('insp-row') as HTMLInputElement).value = String(data.gridPosition.row);
  (document.getElementById('insp-colspan') as HTMLInputElement).value = String(
    data.gridSize.columnSpan,
  );
  (document.getElementById('insp-rowspan') as HTMLInputElement).value = String(
    data.gridSize.rowSpan,
  );
}

function applyInspector() {
  if (!selectedBlockId) return;
  const col = parseInt((document.getElementById('insp-col') as HTMLInputElement).value, 10);
  const row = parseInt((document.getElementById('insp-row') as HTMLInputElement).value, 10);
  const colSpan = parseInt((document.getElementById('insp-colspan') as HTMLInputElement).value, 10);
  const rowSpan = parseInt((document.getElementById('insp-rowspan') as HTMLInputElement).value, 10);
  const block = pegboard.getBlock(selectedBlockId);
  if (!block) return;
  pegboard.updateBlock(selectedBlockId, {
    gridPosition: { ...block.gridPosition, column: col, row: row },
    gridSize: { columnSpan: colSpan, rowSpan: rowSpan },
  });
  updateInspector();
  refreshList();
}

window.addEventListener('DOMContentLoaded', init);
