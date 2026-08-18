import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, FileText,
  Download, Plus, MoreVertical, ChevronDown, ChevronRight,
  FileWarning, Save, ImagePlus, Trash2, Pencil, FolderOpen, FolderKanban,
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

const WORD_MIMES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const isDocumentFile = (file: File) =>
  WORD_MIMES.includes(file.type) || /\.(docx?|pdf)$/i.test(file.name);

const FONT_FAMILIES = ['Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Calibri'];
const FONT_SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Medium', value: '4' },
  { label: 'Large', value: '5' },
  { label: 'X-Large', value: '6' },
  { label: 'Huge', value: '7' },
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
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContent = useRef<string>('');
  const pendingTitle = useRef<string | null>(null);
  const currentDoc = useRef<DocumentItem | null>(null);

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
    }, 900);
  }, [saveNow]);

  const openDocument = useCallback((doc: DocumentItem) => {
    currentDoc.current = doc;
    setSelectedId(doc.id);
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
  }, [navigate]);

  // Initial selection: ?doc= param, then last opened, then first doc.
  useEffect(() => {
    if (loading || docs.length === 0) return;
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
    editorRef.current?.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    handleContentInput();
  }, [handleContentInput]);

  const handleAddDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isDocumentFile(file)) {
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
      openDocument(doc);
      toast({ title: 'Document added', description: `Filed under "My Documents"` });
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

  const handleRename = async (id: number) => {
    const title = renameValue.trim() || 'Untitled document';
    await saveNow(id, currentDoc.current?.id === id ? pendingContent.current : undefined, title);
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
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${doc.title}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--><style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;} img{max-width:100%;}</style></head><body>${content}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80) || 'document'}.doc`;
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
        selectedId === doc.id ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/70 text-foreground/90'
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
          <span className="flex-1 min-w-0 text-xs font-medium truncate">{doc.title}</span>
          <a
            href={`/api/documents/file/${doc.id}`}
            download
            onClick={e => e.stopPropagation()}
            title="Download file"
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
            <p className="text-xs text-muted-foreground">Word documents and PDFs — open, edit, and save</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentDoc.current && (
            <>
              <button
                onClick={handleSaveToFile}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-muted text-foreground rounded-xl font-semibold hover:bg-muted/70 transition-all"
              >
                <Download className="w-4 h-4" />
                Save to File
              </button>
              <button
                onClick={() => saveNow(currentDoc.current!.id, pendingContent.current, pendingTitle.current)}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-card border border-border text-foreground rounded-xl font-semibold hover:bg-muted/70 transition-all"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            {uploading ? 'Adding...' : 'Add Document'}
          </button>
          <input ref={fileInputRef} type="file" accept=".doc,.docx,.pdf" className="hidden" onChange={handleAddDocument} />
        </div>
      </header>

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
                  <p className="text-xs text-muted-foreground px-2 py-1.5">No documents yet — click "Add Document" to upload one.</p>
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
                Tasks
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
              <div className="px-6 py-3 border-b border-border bg-card/60">
                <input
                  value={currentDoc.current.title}
                  onChange={e => updateTitle(e.target.value)}
                  className="w-full bg-transparent text-lg font-bold text-foreground focus:outline-none placeholder:text-muted-foreground"
                  placeholder="Document title"
                />
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {currentDoc.current.fileName}
                  </span>
                  <span>{currentDoc.current.fileType.includes('pdf') ? 'PDF' : 'Word document'}</span>
                  {savedAt && <span className="text-primary">Saved {savedAt.toLocaleTimeString()}</span>}
                  {!savedAt && <span>Edits save automatically</span>}
                </div>
              </div>

              {/* Toolbar */}
              <div className="px-4 py-2 border-b border-border bg-card flex flex-wrap items-center gap-1">
                <ToolbarButton title="Undo" onClick={() => exec('undo')}><Undo2 className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Redo" onClick={() => exec('redo')}><Redo2 className="w-4 h-4" /></ToolbarButton>
                <Divider />
                <ToolbarButton title="Bold" onClick={() => exec('bold')}><Bold className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Italic" onClick={() => exec('italic')}><Italic className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Underline" onClick={() => exec('underline')}><Underline className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Strikethrough" onClick={() => exec('strikeThrough')}><Strikethrough className="w-4 h-4" /></ToolbarButton>
                <Divider />
                <ToolbarButton title="Bullet list" onClick={() => exec('insertUnorderedList')}><List className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered className="w-4 h-4" /></ToolbarButton>
                <Divider />
                <ToolbarButton title="Align left" onClick={() => exec('justifyLeft')}><AlignLeft className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Align center" onClick={() => exec('justifyCenter')}><AlignCenter className="w-4 h-4" /></ToolbarButton>
                <ToolbarButton title="Align right" onClick={() => exec('justifyRight')}><AlignRight className="w-4 h-4" /></ToolbarButton>
                <Divider />
                <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer text-xs text-foreground" title="Insert image">
                  <ImagePlus className="w-4 h-4" />
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleInsertImage} />
                </label>
                <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer text-xs text-foreground" title="Text colour">
                  A
                  <input
                    type="color"
                    defaultValue="#000000"
                    onChange={e => exec('foreColor', e.target.value)}
                    className="w-5 h-5 border-0 bg-transparent cursor-pointer"
                  />
                </label>
                <Divider />
                <select
                  defaultValue="Calibri"
                  onChange={e => exec('fontName', e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-muted/50 border border-border text-xs text-foreground focus:outline-none"
                  title="Font family"
                >
                  {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select
                  defaultValue="3"
                  onChange={e => exec('fontSize', e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-muted/50 border border-border text-xs text-foreground focus:outline-none"
                  title="Font size"
                >
                  {FONT_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {/* Paper */}
              <div className="flex-1 overflow-y-auto p-6">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleContentInput}
                  className="max-w-3xl mx-auto min-h-full bg-card border border-border rounded-xl shadow-sm p-10 text-foreground focus:outline-none outline-none leading-relaxed"
                  style={{ fontSize: '12pt' }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <FileText className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">No document open</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Pick a document from the list on the left, or upload one with "Add Document".
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

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
            <p className="text-sm text-muted-foreground">This removes the document from the editor. The original file is deleted too.</p>
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
            <p className="text-sm text-muted-foreground">
              Only Word documents and PDFs can be added or opened in the Document Editor.
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
    className="p-2 rounded-lg hover:bg-muted text-foreground transition-all"
  >
    {children}
  </button>
);

const Divider = () => <div className="w-px h-5 bg-border mx-1" />;

export default Documents;