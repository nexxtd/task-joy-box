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
  AlignJustify,
  Type,
  Palette,
  Highlighter,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

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
  placeholder,
  minHeight = 150,
  readOnly = false,
}) => {
  const { t } = useLanguage();
  const resolvedPlaceholder = placeholder ?? t('Write something...');
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

          {/* Inline Styles */}
          <button
            type="button"
            onClick={() => exec('bold')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title={t('Bold')}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('italic')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title={t('Italic')}
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('underline')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title={t('Underline')}
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('strikeThrough')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title={t('Strikethrough')}
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Color pickers */}
          <div className="flex items-center gap-1">
            <label className="p-1 rounded-lg hover:bg-muted cursor-pointer flex items-center gap-1" title={t('Text Color')}>
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
            <label className="p-1 rounded-lg hover:bg-muted cursor-pointer flex items-center gap-1" title={t('Highlight Color')}>
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
            title={t('Bullet list')}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('insertOrderedList')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title={t('Numbered list')}
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Alignment */}
          <button
            type="button"
            onClick={() => exec('justifyLeft')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title={t('Align left')}
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('justifyCenter')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title={t('Align center')}
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('justifyRight')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title={t('Align right')}
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => exec('justifyFull')}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title={t('Justify')}
          >
            <AlignJustify className="w-4 h-4" />
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
        data-placeholder={resolvedPlaceholder}
      />
    </div>
  );
};

export default RichTextEditor;
