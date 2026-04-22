'use client';

import type {ContextMenuState} from './types';

interface GraphContextMenuProps {
  contextMenu: ContextMenuState;
  onFocus: () => void;
  onHide: () => void;
  onCopy: () => void;
  onMouseLeave: () => void;
}

export function GraphContextMenu({contextMenu, onFocus, onHide, onCopy, onMouseLeave}: GraphContextMenuProps) {
  return (
    <div
      className="fixed z-50 min-w-[160px] rounded-md border bg-popover text-popover-foreground shadow-md py-1 text-sm"
      style={{left: contextMenu.x, top: contextMenu.y}}
      onMouseLeave={onMouseLeave}
    >
      <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left transition-colors" onClick={onFocus}>
        Focus on this node
      </button>
      <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left transition-colors" onClick={onHide}>
        Hide node
      </button>
      <div className="my-1 border-t" />
      <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left transition-colors" onClick={onCopy}>
        Copy label
      </button>
    </div>
  );
}
