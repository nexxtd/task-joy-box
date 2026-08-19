import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ImagePlus,
  Heading1,
  Heading2,
  Heading3,
  Type,
  Palette,
  Highlighter,
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Write something...',
  minHeight = 150,
  readOnly = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [textColor, setTextColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffff00');

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== (value || '')) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command: string, val: string | undefined = undefined) => {
    if (readOnly) return;
    document.execCommand(command, false, val);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleImageInsert = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const url = ev.target?.result as string;
        if (url) {
          exec('insertImage', url);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/30 select-none">
          {/* Format Block */}
          <select
            onChange={e => exec('formatBlock', e.target.value)}
            defaultValue="p"
            className="h-8 text-xs bg-muted border border-border rounded-lg px-2 text-foreground focus:outline-none cursor-pointer"
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
          </select>

          {/* Font Size */}
          <select
            onChange={e => exec('fontSize', e.target.value)}
            defaultValue="3"
            className="h-8 text-xs bg-muted border border-border rounded-lg px-2 text-foreground focus:outline-none cursor-pointer"
          >
            <option value="1">Small</option>
            <option value="3">Normal</option>
            <option value="5">Large</option>
            <option value="7">Huge</option>
          </select>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Inline Styles */}
          <button
            type="button"
            onClick={() => exec('bold')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('italic')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('underline')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('strikeThrough')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Color pickers */}
          <div className="flex items-center gap-1">
            <label className="p-1 rounded-lg hover:bg-muted cursor-pointer flex items-center gap-1" title="Text Color">
              <Palette className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="color"
                value={textColor}
                onChange={e => {
                  setTextColor(e.target.value);
                  exec('foreColor', e.target.value);
                }}
                className="w-4 h-4 border-0 p-0 cursor-pointer bg-transparent"
              />
            </label>
            <label className="p-1 rounded-lg hover:bg-muted cursor-pointer flex items-center gap-1" title="Highlight Color">
              <Highlighter className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="color"
                value={bgColor}
                onChange={e => {
                  setBgColor(e.target.value);
                  exec('hiliteColor', e.target.value);
                }}
                className="w-4 h-4 border-0 p-0 cursor-pointer bg-transparent"
              />
            </label>
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Lists */}
          <button
            type="button"
            onClick={() => exec('insertUnorderedList')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Bullet list"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('insertOrderedList')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Numbered list"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Alignment */}
          <button
            type="button"
            onClick={() => exec('justifyLeft')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Align left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('justifyCenter')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Align center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('justifyRight')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Align right"
          >
            <AlignRight className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Insert Image */}
          <button
            type="button"
            onClick={handleImageInsert}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 text-xs"
            title="Insert inline image"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editor editable area */}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        onInput={handleInput}
        style={{ minHeight }}
        className="p-4 text-sm text-foreground focus:outline-none overflow-y-auto"
        data-placeholder={placeholder}
      />
    </div>
  );
};

export default RichTextEditor;
