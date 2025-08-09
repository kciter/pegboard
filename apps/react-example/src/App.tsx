import React, { useEffect, useState } from 'react';
import { Pegboard } from '@pegboard/react';
import type { BlockData, Pegboard as PegboardInstance } from '@pegboard/core';
import { BlockExtension } from '@pegboard/core';
import './styles.css';

// Note: Example uses inline extensions for demo only; no external preset packages.

interface TextAttrs {
  content: string;
}
class TextBlockExtension extends BlockExtension<TextAttrs> {
  readonly type = 'text';
  readonly defaultLayout = {
    x: 1,
    y: 1,
    width: 3,
    height: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
  } as const;
  readonly defaultAttributes = { content: 'Text Block' } as const;
  render(data: BlockData & { attributes: TextAttrs }, container: HTMLElement) {
    container.innerHTML = `<div class=\"demo-block text-block\">${data.attributes.content}</div>`;
  }
}
interface ColorAttrs {
  color: string;
}
class ColorBlockExtension extends BlockExtension<ColorAttrs> {
  readonly type = 'color';
  readonly defaultLayout = {
    x: 4,
    y: 1,
    width: 2,
    height: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 4,
    maxHeight: 4,
  } as const;
  readonly defaultAttributes = { color: '#51cf66' } as const;
  render(data: BlockData & { attributes: ColorAttrs }, container: HTMLElement) {
    container.innerHTML = `<div class=\"demo-block color-block\" style=\"background:${data.attributes.color}\">Color</div>`;
  }
}

function BoardArea({ allowOverlap }: { allowOverlap: boolean }) {
  const plugins = [new TextBlockExtension(), new ColorBlockExtension()];
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [pegboardInstance, setPegboardInstance] = useState<PegboardInstance | null>(null);

  useEffect(() => {
    if (!pegboardInstance) return;
    const sync = () => setBlocks(pegboardInstance.getAllBlocks());
    sync();
    pegboardInstance.on('block:added', sync);
    pegboardInstance.on('block:removed', sync);
    pegboardInstance.on('block:updated', sync);
    pegboardInstance.on('block:moved', sync);
    pegboardInstance.on('block:resized', sync);
    return () => {
      pegboardInstance.off('block:added', sync);
      pegboardInstance.off('block:removed', sync);
      pegboardInstance.off('block:updated', sync);
      pegboardInstance.off('block:moved', sync);
      pegboardInstance.off('block:resized', sync);
    };
  }, [pegboardInstance]);

  return (
    <>
      <Pegboard
        className="pegboard-container demo-board"
        grid={{ columns: 12, rowHeight: 60, gap: 8 }}
        mode="editor"
        plugins={plugins as any}
        allowOverlap={allowOverlap}
        onReady={(inst: PegboardInstance) => {
          setPegboardInstance(inst);
          if (inst.getAllBlocks().length === 0) {
            inst.addBlock({ type: 'text', attributes: { content: 'Hello Pegboard' } });
            inst.addBlock({ type: 'color' });
          }
        }}
      />
      <aside className="sidebar">
        <h3>Blocks ({blocks.length})</h3>
        <ul>
          {blocks.map((b) => (
            <li key={b.id}>
              {b.type} @ ({b.gridPosition.column},{b.gridPosition.row})
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <button onClick={() => pegboardInstance?.addBlock({ type: 'text' })}>Add Text</button>
          <button onClick={() => pegboardInstance?.addBlock({ type: 'color' })}>Add Color</button>
        </div>
      </aside>
    </>
  );
}

export default function App() {
  const [allowOverlap, setAllowOverlap] = useState(false);
  return (
    <div className="app-shell">
      <header>
        <h1>Pegboard React Example</h1>
        <div className="controls">
          <label>
            <input
              type="checkbox"
              checked={allowOverlap}
              onChange={(e) => setAllowOverlap(e.target.checked)}
            />{' '}
            Allow Overlap
          </label>
        </div>
      </header>
      <div className="board-wrapper" style={{ display: 'contents' }}>
        <BoardArea allowOverlap={allowOverlap} />
      </div>
    </div>
  );
}
