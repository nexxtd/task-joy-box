import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ComingSoon from '@/components/shared/ComingSoon';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo2, Redo2, FileText,
  Download, Plus, MoreVertical, ChevronDown, ChevronRight,
  FileWarning, Save, ImagePlus, Trash2, Pencil, FolderOpen, FolderKanban,
  FilePlus, Upload, Outdent, Indent, Heading1, Heading2, Heading3, Highlighter, Type
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface DocumentItem {
  id: number;
  taskId: string | null;
  taskTitle: string | null;
  title: string;
  content: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  updatedAt: string;
}

const SUPPORTED_DOC_MIMES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/html',
  'application/xhtml+xml',
  'application/pdf',
  'application/epub+zip',
];

const isDocumentFile = (file: File) =>
  SUPPORTED_DOC_MIMES.includes(file.type) || /\.(docx?|odt|rtf|txt|md|html?|pdf|epub)$/i.test(file.name);

const FONT_FAMILIES = [
  'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New',
  'Calibri', 'Comic Sans MS', 'Impact', 'Trebuchet MS'
];

const FONT_SIZES = [
  { label: 'Small (12px)', value: '2' },
  { label: 'Normal (14px)', value: '3' },
  { label: 'Medium (18px)', value: '4' },
  { label: 'Large (24px)', value: '5' },
  { label: 'X-Large (32px)', value: '6' },
  { label: 'Huge (48px)', value: '7' },
];

const GROUP_COLORS = ['hsl(var(--primary))', '#f97316', '#8b5cf6', '#10b981', '#ef4444'];

const Documents: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [docTitle, setDocTitle] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContent = useRef<string>('');
  const pendingTitle = useRef<string | null>(null);
  const currentDoc = useRef<DocumentItem | null>(null);
  const initRef = useRef(false);

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch('/api/documents', { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDocs(data);
    } catch {
      toast({ title: 'Error', description: 'Could not load documents.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const saveNow = useCallback(async (targetId: number, content: string, title: string | null) => {
    const body: { content?: string; title?: string } = {};
    if (content !== undefined) body.content = content;
    if (title !== null && title !== undefined) body.title = title;
    try {
      setSaving(true);
      const res = await fetch(`/api/documents/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setDocs(prev => prev.map(d => d.id === updated.id ? updated : d));
      if (currentDoc.current && currentDoc.current.id === updated.id) {
        currentDoc.current = updated;
      }
      setSavedAt(new Date());
    } catch {
      toast({ title: 'Error', description: 'Could not save the document.' });
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback((id: number, content: string, title: string | null) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveNow(id, content ?? pendingContent.current, title ?? pendingTitle.current);
    }, 800);
  }, [saveNow]);

  const openDocument = useCallback((doc: DocumentItem) => {
    // Flush previous pending saves if switching docs
    if (currentDoc.current && currentDoc.current.id !== doc.id && saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveNow(currentDoc.current.id, pendingContent.current, pendingTitle.current);
    }

    currentDoc.current = doc;
    setSelectedId(doc.id);
    setDocTitle(doc.title);
    setMenuFor(null);
    setRenamingId(null);
    localStorage.setItem('lastDocumentId', String(doc.id));
    navigate(`/documents?doc=${doc.id}`, { replace: true });
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = doc.content || '';
        pendingContent.current = doc.content || '';
      }
      pendingTitle.current = doc.title;
    });
  }, [navigate, saveNow]);

  // Initial selection
  useEffect(() => {
    if (loading || initRef.current) return;
    initRef.current = true;
    const paramId = searchParams.get('doc');
    if (paramId) {
      const doc = docs.find(d => d.id === Number(paramId));
      if (doc) { openDocument(doc); return; }
    }
    const lastId = localStorage.getItem('lastDocumentId');
    if (lastId) {
      const doc = docs.find(d => d.id === Number(lastId));
      if (doc) { openDocument(doc); return; }
    }
    if (!selectedId) {
      const first = docs[0];
      if (first) openDocument(first);
    }
  }, [loading, docs, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleContentInput = useCallback(() => {
    const el = editorRef.current;
    if (!el || !currentDoc.current) return;
    pendingContent.current = el.innerHTML;
    scheduleSave(currentDoc.current.id, pendingContent.current, pendingTitle.current);
  }, [scheduleSave]);

  const updateTitle = useCallback((value: string) => {
    pendingTitle.current = value;
    if (currentDoc.current) {
      setDocs(prev => prev.map(d => d.id === currentDoc.current!.id ? { ...d, title: value } : d));
      scheduleSave(currentDoc.current.id, pendingContent.current, value);
    }
  }, [scheduleSave]);

  const exec = useCallback((command: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    el.focus({ preventScroll: true });
    if (range && sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    handleContentInput();
  }, [handleContentInput]);

  const handleCreateNewDocument = async () => {
    setCreatingNew(true);
    try {
      const res = await fetch('/api/documents/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: 'Untitled document', content: '' }),
      });
      if (!res.ok) throw new Error();
      const newDoc = await res.json();
      setDocs(prev => [newDoc, ...prev]);
      setShowAddModal(false);
      openDocument(newDoc);
      toast({ title: 'Document created', description: 'New blank document ready to edit.' });
    } catch {
      toast({ title: 'Error', description: 'Could not create new document.' });
    } finally {
      setCreatingNew(false);
    }
  };

  const handleAddDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isDocumentFile(file)) {
      setShowAddModal(false);
      setShowIncompatible(true);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/documents', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.error === 'FILE_NOT_COMPATIBLE') setShowIncompatible(true);
        else toast({ title: 'Error', description: data?.error === 'FILE_TOO_LARGE' ? data.message : 'Upload failed.' });
        return;
      }
      const doc = await res.json();
      setDocs(prev => [doc, ...prev]);
      setShowAddModal(false);
      openDocument(doc);
      toast({ title: 'Document imported', description: `Filed under "My Documents"` });
    } catch {
      toast({ title: 'Error', description: 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const handleInsertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editorRef.current?.focus();
      document.execCommand('insertImage', false, String(reader.result));
      handleContentInput();
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // Preserve standard HTML rich text copy-paste
    handleContentInput();
  };

  const handleRename = async (id: number) => {
    const title = renameValue.trim() || 'Untitled document';
    await saveNow(id, currentDoc.current?.id === id ? pendingContent.current : undefined, title);
    if (currentDoc.current && currentDoc.current.id === id) {
      setDocTitle(title);
    }
    setRenamingId(null);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error();
      setDocs(prev => prev.filter(d => d.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        currentDoc.current = null;
        setDocTitle('');
        localStorage.removeItem('lastDocumentId');
        navigate('/documents', { replace: true });
      }
      toast({ title: 'Document deleted' });
    } catch {
      toast({ title: 'Error', description: 'Could not delete the document.' });
    }
  };

  const handleSaveToFile = () => {
    const doc = currentDoc.current;
    if (!doc) return;
    const content = editorRef.current?.innerHTML || doc.content || '';
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${doc.title}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--><style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;} img{max-width:100%;} table{border-collapse:collapse;} td,th{border:1px solid #ccc;padding:4px 8px;}</style></head><body>${content}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(doc.title || 'document').replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80) || 'document'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const { myDocs, taskGroups } = useMemo(() => {
    const mine = docs.filter(d => !d.taskId);
    const grouped = new Map<string, { title: string; docs: DocumentItem[] }>();
    for (const d of docs) {
      if (!d.taskId) continue;
      const key = d.taskId;
      if (!grouped.has(key)) {
        grouped.set(key, { title: d.taskTitle || 'Task', docs: [] });
      }
      grouped.get(key)!.docs.push(d);
    }
    const groups = Array.from(grouped.entries())
      .map(([key, g]) => ({ key, ...g }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { myDocs: mine, taskGroups: groups };
  }, [docs]);

  const groupColor = (key: string) => {
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return GROUP_COLORS[hash % GROUP_COLORS.length];
  };

  const renderDocEntry = (doc: DocumentItem, groupKey: string | null) => (
    <div
      key={doc.id}
      className={`group/doc relative flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
        selectedId === doc.id ? 'bg-primary/10 text-foreground font-semibold' : 'hover:bg-muted/70 text-foreground/90'
      }`}
      style={{ marginLeft: groupKey ? 8 : 0 }}
      onClick={() => openDocument(doc)}
    >
      {renamingId === doc.id ? (
        <input
          autoFocus
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleRename(doc.id);
            if (e.key === 'Escape') setRenamingId(null);
          }}
          onBlur={() => handleRename(doc.id)}
          onClick={e => e.stopPropagation()}
          className="flex-1 min-w-0 text-xs bg-background border border-primary rounded px-1.5 py-0.5 focus:outline-none"
        />
      ) : (
        <>
          <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="flex-1 min-w-0 text-xs truncate">{doc.title}</span>
          <a
            href={doc.fileUrl ? `/api/documents/file/${doc.id}` : '#'}
            download
            onClick={e => {
              if (!doc.fileUrl) { e.preventDefault(); handleSaveToFile(); return; }
              e.stopPropagation();
            }}
            title="Download document file"
            className="p-1 rounded hover:bg-background text-muted-foreground hover:text-primary transition-all"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setMenuFor(menuFor === doc.id ? null : doc.id); }}
              className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-all"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {menuFor === doc.id && (
              <div
                className="absolute right-0 top-6 z-50 w-36 bg-card border border-border rounded-xl shadow-xl py-1"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => { setRenamingId(doc.id); setRenameValue(doc.title); setMenuFor(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted text-left"
                >
                  <Pencil className="w-3 h-3" /> Rename
                </button>
                <button
                  onClick={() => { setDeletingId(doc.id); setMenuFor(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 text-left"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Document Editor</h1>
            <p className="text-xs text-muted-foreground">Word documents, Google Docs, PDFs, RTF & text — create, open, edit & export</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentDoc.current && (
            <>
              <button
                onClick={handleSaveToFile}
                className="flex items-center gap-2 px-3.5 py-2 text-xs bg-muted text-foreground rounded-xl font-semibold hover:bg-muted/70 transition-all"
                title="Export document as downloadable file"
              >
                <Download className="w-4 h-4" />
                Save to File
              </button>
              <button
                onClick={() => saveNow(currentDoc.current!.id, pendingContent.current, pendingTitle.current)}
                disabled={saving}
                className="flex items-center gap-2 px-3.5 py-2 text-xs bg-card border border-border text-foreground rounded-xl font-semibold hover:bg-muted/70 transition-all"
                title="Save changes immediately"
              >
                <Save className="w-4 h-4 text-primary" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            disabled={uploading || creatingNew}
            className="flex items-center gap-2 px-4 py-2 text-xs bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Document
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".doc,.docx,.odt,.rtf,.txt,.md,.html,.htm,.pdf,.epub"
            className="hidden"
            onChange={handleAddDocument}
          />
        </div>
      </header>

      <ComingSoon
        title="Document Collaboration"
        description="Co-author documents in real-time, leave comments, and track changes. Coming in a future update."
        onNotify={() => window.location.href = '/pricing'}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: document list */}
        <aside className="w-72 flex-shrink-0 border-r border-border bg-card/40 overflow-y-auto">
          <div className="p-3 space-y-1">
            <button
              onClick={() => setCollapsed(prev => ({ ...prev, my: !prev.my }))}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/70 text-sm font-bold text-foreground"
            >
              {collapsed.my ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              <FolderOpen className="w-4 h-4 text-primary" />
              My Documents
              <span className="text-xs font-normal text-muted-foreground ml-auto">{myDocs.length}</span>
            </button>
            {!collapsed.my && (
              <div className="space-y-0.5">
                {myDocs.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1.5">No documents yet — click "Add Document" to start.</p>
                )}
                {myDocs.map(d => renderDocEntry(d, null))}
              </div>
            )}

            <div className="pt-3">
              <button
                onClick={() => setCollapsed(prev => ({ ...prev, tasks: !prev.tasks }))}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/70 text-sm font-bold text-foreground"
              >
                {collapsed.tasks ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                <FolderKanban className="w-4 h-4 text-primary" />
                Task Documents
                <span className="text-xs font-normal text-muted-foreground ml-auto">{taskGroups.length}</span>
              </button>
              {!collapsed.tasks && (
                <div className="space-y-1">
                  {taskGroups.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1.5">Files opened from tasks appear here.</p>
                  )}
                  {taskGroups.map(group => (
                    <div key={group.key} className="space-y-0.5">
                      <button
                        onClick={() => setCollapsed(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/70 text-xs font-semibold text-foreground/90"
                      >
                        {collapsed[group.key] ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: groupColor(group.key) }} />
                        <span className="flex-1 min-w-0 truncate">{group.title}</span>
                        <span className="text-[10px] text-muted-foreground">{group.docs.length}</span>
                      </button>
                      {!collapsed[group.key] && group.docs.map(d => renderDocEntry(d, group.key))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Right: editor */}
        <main className="flex-1 flex flex-col overflow-hidden bg-muted/20">
          {currentDoc.current ? (
            <>
              {/* Document Title Header */}
              <div className="px-6 py-3 border-b border-border bg-card/60">
                <input
                  value={docTitle}
                  onChange={e => {
                    setDocTitle(e.target.value);
                    updateTitle(e.target.value);
                  }}
                  className="w-full bg-transparent text-xl font-bold text-foreground focus:outline-none placeholder:text-muted-foreground"
                  placeholder="Document title"
                />
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3 text-primary" /> {currentDoc.current.fileName || 'Document'}
                  </span>
                  {savedAt && <span className="text-primary font-medium">Saved {savedAt.toLocaleTimeString()}</span>}
                  {!savedAt && <span>Edits save automatically</span>}
                </div>
              </div>

              {/* Formatting Toolbar */}
              <div className="px-4 py-2 border-b border-border bg-card flex flex-wrap items-center gap-1">
                {/* Undo / Redo */}
                <ToolbarButton title="Undo" onClick={() => exec('undo')}><Undo2 className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Redo" onClick={() => exec('redo')}><Redo2 className="w-4 h-4" /></ToolbarButton>
                <Divider />

                {/* Font Family & Size */}
                <select
                  defaultValue="Calibri"
                  onChange={e => exec('fontName', e.target.value)}
                  className="px-2 py-1 rounded-lg bg-muted/60 border border-border text-xs text-foreground focus:outline-none"
                  title="Font Family"
                >
                  {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>

                <select
                  defaultValue="3"
                  onChange={e => exec('fontSize', e.target.value)}
                  className="px-2 py-1 rounded-lg bg-muted/60 border border-border text-xs text-foreground focus:outline-none"
                  title="Font Size"
                >
                  {FONT_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                {/* Heading Styles */}
                <select
                  defaultValue="P"
                  onChange={e => exec('formatBlock', e.target.value)}
                  className="px-2 py-1 rounded-lg bg-muted/60 border border-border text-xs text-foreground focus:outline-none font-medium"
                  title="Heading / Paragraph Style"
                >
                  <option value="P">Normal Text</option>
                  <option value="H1">Heading 1</option>
                  <option value="H2">Heading 2</option>
                  <option value="H3">Heading 3</option>
                  <option value="BLOCKQUOTE">Quote</option>
                  <option value="PRE">Code Block</option>
                </select>
                <Divider />

                {/* Text Formatting */}
                <ToolbarButton title="Bold" onClick={() => exec('bold')}><Bold className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Italic" onClick={() => exec('italic')}><Italic className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Underline" onClick={() => exec('underline')}><Underline className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Strikethrough" onClick={() => exec('strikeThrough')}><Strikethrough className="w-4 h-4" /></ToolbarButton>
                <Divider />

                {/* Colors */}
                <label className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted cursor-pointer text-xs text-foreground" title="Text Color">
                  <Type className="w-4 h-4 text-primary" />
                  <input
                    type="color"
                    defaultValue="#000000"
                    onChange={e => exec('foreColor', e.target.value)}
                    className="w-4 h-4 border-0 bg-transparent cursor-pointer"
                  />
                </label>

                <label className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted cursor-pointer text-xs text-foreground" title="Text Highlight / Background Color">
                  <Highlighter className="w-4 h-4 text-yellow-500" />
                  <input
                    type="color"
                    defaultValue="#ffff00"
                    onChange={e => exec('hiliteColor', e.target.value)}
                    className="w-4 h-4 border-0 bg-transparent cursor-pointer"
                  />
                </label>
                <Divider />

                {/* Alignment */}
                <ToolbarButton title="Align Left" onClick={() => exec('justifyLeft')}><AlignLeft className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Align Center" onClick={() => exec('justifyCenter')}><AlignCenter className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Align Right" onClick={() => exec('justifyRight')}><AlignRight className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Justify" onClick={() => exec('justifyFull')}><AlignJustify className="w-4 h-4" /></ToolbarButton>
                <Divider />

                {/* Lists & Indentation */}
                <ToolbarButton title="Bullet List" onClick={() => exec('insertUnorderedList')}><List className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Numbered List" onClick={() => exec('insertOrderedList')}><ListOrdered className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Decrease Indent (Outdent)" onClick={() => exec('outdent')}><Outdent className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Increase Indent" onClick={() => exec('indent')}><Indent className="w-4 h-4" /></ToolbarButton>
                <Divider />

                {/* Inline Image */}
                <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted cursor-pointer text-xs text-foreground font-medium" title="Insert Inline Image">
                  <ImagePlus className="w-4 h-4 text-primary" />
                  <span className="hidden md:inline">Image</span>
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleInsertImage} />
                </label>
              </div>

              {/* Editor Canvas / Paper */}
              <div className="flex-1 overflow-y-auto p-6">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleContentInput}
                  onPaste={handlePaste}
                  className="max-w-3xl mx-auto min-h-[90%] bg-card border border-border rounded-xl shadow-sm p-10 text-foreground focus:outline-none outline-none leading-relaxed prose dark:prose-invert max-w-none"
                  style={{ fontSize: '12pt', minHeight: '600px' }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm px-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <FileText className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground">No document open</h2>
                <p className="text-xs text-muted-foreground">
                  Pick a document from the sidebar on the left, or click "Add Document" to create a new blank file or import an existing one.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl shadow hover:bg-primary/90 transition-all inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Document
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Document Choice Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-5 animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Add Document</h3>
                <p className="text-xs text-muted-foreground">Select how you want to add a document</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Create New */}
              <button
                onClick={handleCreateNewDocument}
                disabled={creatingNew}
                className="flex flex-col items-center text-center p-5 rounded-2xl border border-border bg-card hover:bg-muted/60 hover:border-primary/50 transition-all group cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <FilePlus className="w-6 h-6 text-primary" />
                </div>
                <h4 className="text-sm font-bold text-foreground mb-1">Create New</h4>
                <p className="text-[11px] text-muted-foreground">Start with a clean blank document ready to edit</p>
              </button>

              {/* Option 2: Upload Existing */}
              <button
                onClick={() => {
                  setShowAddModal(false);
                  fileInputRef.current?.click();
                }}
                disabled={uploading}
                className="flex flex-col items-center text-center p-5 rounded-2xl border border-border bg-card hover:bg-muted/60 hover:border-primary/50 transition-all group cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6 text-emerald-500" />
                </div>
                <h4 className="text-sm font-bold text-foreground mb-1">Upload File</h4>
                <p className="text-[11px] text-muted-foreground">Import existing Word, Google Doc, ODT, RTF, HTML, or PDF file</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingId !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4" onClick={() => setDeletingId(null)}>
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <h3 className="text-base font-bold text-foreground">Delete document?</h3>
            <p className="text-sm text-muted-foreground">This removes the document from the editor. The original file will be removed too.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 bg-muted text-foreground rounded-xl text-sm font-semibold">Cancel</button>
              <button onClick={() => { handleDelete(deletingId); setDeletingId(null); }} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-xl text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Not compatible popup */}
      {showIncompatible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4" onClick={() => setShowIncompatible(false)}>
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <FileWarning className="w-6 h-6 text-destructive" />
            </div>
            <h3 className="text-base font-bold text-foreground">File not compatible</h3>
            <p className="text-xs text-muted-foreground">
              Compatible file types include Word (.docx, .doc), Google Docs exports, OpenDocument (.odt), RTF, Markdown, Text, HTML, and PDF.
            </p>
            <button onClick={() => setShowIncompatible(false)} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ToolbarButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button
    title={title}
    onMouseDown={e => e.preventDefault()}
    onClick={onClick}
    className="p-1.5 rounded-lg hover:bg-muted text-foreground transition-all"
  >
    {children}
  </button>
);

const Divider = () => <div className="w-px h-5 bg-border mx-1" />;

export default Documents;