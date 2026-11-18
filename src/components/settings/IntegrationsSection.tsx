import React, { useState, useEffect } from 'react';
import {
  Link2, Link2Off, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink,
  Download, Upload, Check, FolderKanban, ListChecks, Layers, Sparkles, ChevronRight,
  ChevronDown, ArrowRight, Loader2, FileText, CheckSquare, KeyRound
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ClickUpUser {
  id?: string;
  username?: string;
  email?: string;
  profilePicture?: string;
}

interface ClickUpTeam {
  id: string;
  name: string;
}

interface ClickUpList {
  id: string;
  name: string;
  taskCount: number;
}

interface ClickUpSpace {
  id: string;
  name: string;
  color?: string;
  lists: ClickUpList[];
  folders: Array<{
    id: string;
    name: string;
    lists: ClickUpList[];
  }>;
}

export default function IntegrationsSection() {
  const { toast } = useToast();

  // ClickUp status
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<ClickUpUser | null>(null);
  const [teams, setTeams] = useState<ClickUpTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

  // Connect form
  const [connectingProvider, setConnectingProvider] = useState<'clickup' | 'trello' | null>(null);
  const [showClickupTokenForm, setShowClickupTokenForm] = useState(false);
  const [clickupTokenInput, setClickupTokenInput] = useState('');
  const [clickupTokenBusy, setClickupTokenBusy] = useState(false);
  const [oauthErrorBanner, setOauthErrorBanner] = useState<string>('');

  // Hierarchy & selection
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [spaces, setSpaces] = useState<ClickUpSpace[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());
  const [showCustomSelection, setShowCustomSelection] = useState(false);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());

  // Import state
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState<string>('');
  const [importResult, setImportResult] = useState<any>(null);

  // File import state
  const [fileImporting, setFileImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState<any[] | null>(null);
  const [fileProjectName, setFileProjectName] = useState('Imported Project');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/clickup/status', { credentials: 'include' });
      const data = await res.json();
      if (data.connected) {
        setConnected(true);
        setUser(data.user);
        setTeams(data.teams || []);
        if (data.teams?.[0]?.id) {
          setSelectedTeamId(data.teams[0].id);
        }
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  // One-click sign-in: the server builds the provider's OAuth URL and we
  // redirect there. On return the server has already imported everything.
  const startOAuth = async (provider: 'clickup' | 'trello') => {
    setConnectingProvider(provider);
    setOauthErrorBanner('');
    try {
      const origin = encodeURIComponent(window.location.origin);
      const res = await fetch(`/api/integrations/${provider}/auth?origin=${origin}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authUrl) throw new Error(data.error || 'Could not start sign-in');
      window.location.href = data.authUrl;
    } catch (err: any) {
      toast({ title: 'Sign-in unavailable', description: err.message, variant: 'destructive' });
      setOauthErrorBanner(err.message);
      if (provider === 'clickup') setShowClickupTokenForm(true);
      setConnectingProvider(null);
    }
  };

  const handleClickupTokenConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clickupTokenInput.trim()) return;
    setClickupTokenBusy(true);
    try {
      const res = await fetch('/api/integrations/clickup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: clickupTokenInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to connect ClickUp token');
      setClickupTokenInput('');
      setShowClickupTokenForm(false);
      setOauthErrorBanner('');
      toast({ title: 'ClickUp connected', description: `Signed in as ${data.user?.username || 'ClickUp User'}.` });
      await checkStatus();
    } catch (err: any) {
      toast({ title: 'ClickUp token error', description: err.message, variant: 'destructive' });
    } finally {
      setClickupTokenBusy(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clean = () => {
      ['connected', 'imported', 'integrationError', 'integrationErrorReason', 'trelloCallback'].forEach(k => params.delete(k));
      const qs = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    };
    // Trello's own "Allow" screen returns the token in the URL fragment.
    if (params.get('trelloCallback') === '1') {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token = hash.get('token') || '';
      const hashError = hash.get('error') || '';
      // Strip the token from the address bar before anything else runs.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      clean();
      if (!token) {
        const desc = hashError ? 'Trello sign-in was cancelled.' : 'Trello did not return an access token. Please try again.';
        toast({ title: 'Connection failed', description: desc, variant: 'destructive' });
        setOauthErrorBanner(desc);
        return;
      }
      setConnectingProvider('trello');
      void (async () => {
        try {
          const res = await fetch('/api/integrations/trello/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token, fromOneClick: true }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Could not connect Trello');
          toast({ title: 'Trello connected', description: `Imported ${data.imported || 0} tasks from Trello.` });
          window.dispatchEvent(new Event('trello-connected'));
        } catch (err: any) {
          toast({ title: 'Connection failed', description: err.message, variant: 'destructive' });
          setOauthErrorBanner(err.message);
        } finally {
          setConnectingProvider(null);
        }
      })();
      return;
    }

    const provider = params.get('connected');
    if (provider === 'clickup' || provider === 'trello') {
      const name = provider === 'clickup' ? 'ClickUp' : 'Trello';
      toast({ title: `${name} connected`, description: `Imported ${params.get('imported') || 0} tasks from ${name}.` });
      if (provider === 'clickup') void checkStatus();
      if (provider === 'trello') window.dispatchEvent(new Event('trello-connected'));
      clean();
    } else if (params.get('integrationError')) {
      const code = params.get('integrationError') || '';
      const reason = params.get('integrationErrorReason') || '';
      const desc = reason
        ? reason
        : code.endsWith('denied') || code.endsWith('access_denied')
          ? 'Sign-in was cancelled.'
          : code.endsWith('expired')
            ? 'Sign-in session expired. Please try again or use an API token below.'
            : 'Something went wrong while connecting. Please try again or connect with an API token.';
      toast({
        title: 'Connection failed',
        description: desc,
        variant: 'destructive',
      });
      setOauthErrorBanner(desc);
      if (code.startsWith('clickup')) setShowClickupTokenForm(true);
      clean();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your ClickUp account? Your already-imported tasks in Planora will remain.')) return;
    try {
      await fetch('/api/integrations/clickup/disconnect', {
        method: 'POST',
        credentials: 'include',
      });
      setConnected(false);
      setUser(null);
      setTeams([]);
      setSpaces([]);
      setSelectedListIds(new Set());
      setImportResult(null);
      toast({ title: 'ClickUp Disconnected' });
    } catch {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    }
  };

  const loadHierarchy = async () => {
    if (!selectedTeamId && !teams[0]?.id) return;
    setLoadingHierarchy(true);
    try {
      const tId = selectedTeamId || teams[0]?.id;
      const res = await fetch(`/api/integrations/clickup/hierarchy?teamId=${tId}`, { credentials: 'include' });
      const data = await res.json();
      if (data.spaces) {
        setSpaces(data.spaces);
        // Expand all spaces by default
        setExpandedSpaces(new Set(data.spaces.map((s: any) => s.id)));
      }
    } catch (err: any) {
      toast({ title: 'Failed to load ClickUp spaces', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingHierarchy(false);
    }
  };

  const toggleSelectAllLists = () => {
    const allIds = new Set<string>();
    spaces.forEach(sp => {
      sp.lists.forEach(l => allIds.add(l.id));
      sp.folders.forEach(fol => fol.lists.forEach(l => allIds.add(l.id)));
    });

    if (selectedListIds.size === allIds.size) {
      setSelectedListIds(new Set());
    } else {
      setSelectedListIds(allIds);
    }
  };

  const toggleListId = (id: string) => {
    setSelectedListIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSpaceExpand = (spaceId: string) => {
    setExpandedSpaces(prev => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  };

  const handleImport = async (importAll = true) => {
    setImporting(true);
    setImportResult(null);
    setImportStep('Connecting to ClickUp API...');

    try {
      const listIds = importAll ? [] : Array.from(selectedListIds);
      if (!importAll && listIds.length === 0) {
        throw new Error('Please select at least one ClickUp list to import.');
      }

      setImportStep('Fetching tasks, subtasks, and checklists...');

      const res = await fetch('/api/integrations/clickup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          teamId: selectedTeamId || teams[0]?.id,
          listIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import ClickUp items');
      }

      setImportStep('Finished importing items!');
      setImportResult(data);
      toast({
        title: 'Import Complete! 🎉',
        description: data.message || `Successfully copied ${data.imported?.tasks || 0} tasks over to Planora.`,
      });
    } catch (err: any) {
      toast({
        title: 'Import Failed',
        description: err.message,
        variant: 'destructive',
      });
      setImportStep('');
    } finally {
      setImporting(false);
    }
  };

  // Handle File Upload (CSV or JSON export from ClickUp/Trello/Asana)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const text = String(event.target?.result || '');
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          const rawItems = Array.isArray(parsed) ? parsed : parsed.tasks || parsed.cards || parsed.items || [];
          setFileContent(rawItems);
        } else {
          // Parse CSV
          const rows = text.split(/\r?\n/).filter(r => r.trim());
          if (rows.length < 2) throw new Error('CSV file is empty');
          const headers = rows[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
          
          const titleIdx = headers.findIndex(h => /title|task|name|summary/i.test(h));
          const descIdx = headers.findIndex(h => /desc/i.test(h));
          const dueIdx = headers.findIndex(h => /due/i.test(h));
          const prioIdx = headers.findIndex(h => /prio/i.test(h));
          const statusIdx = headers.findIndex(h => /status|stage/i.test(h));

          const parsedItems = rows.slice(1).map(row => {
            const cols = row.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
            return {
              title: titleIdx >= 0 ? cols[titleIdx] : cols[0],
              description: descIdx >= 0 ? cols[descIdx] : '',
              dueDate: dueIdx >= 0 ? cols[dueIdx] : undefined,
              priority: prioIdx >= 0 ? cols[prioIdx].toLowerCase() : 'none',
              status: statusIdx >= 0 ? cols[statusIdx].toLowerCase() : 'to_do',
            };
          }).filter(item => item.title && item.title.trim().length > 0);

          setFileContent(parsedItems);
        }
      } catch (err: any) {
        toast({ title: 'Invalid File', description: err.message, variant: 'destructive' });
      }
    };
    reader.readAsText(file);
  };

  const handleProcessFileImport = async () => {
    if (!fileContent || fileContent.length === 0) return;
    setFileImporting(true);
    try {
      const res = await fetch('/api/integrations/import-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: fileContent,
          projectName: fileProjectName || 'Imported Project',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import file');

      toast({
        title: 'Import Successful',
        description: data.message || `Imported ${fileContent.length} tasks!`,
      });
      setFileContent(null);
      setFileName('');
    } catch (err: any) {
      toast({ title: 'Import Failed', description: err.message, variant: 'destructive' });
    } finally {
      setFileImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">

      {/* 1. ClickUp Integration Card */}
      <div className="bg-card border-2 border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:border-primary/30">
        <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${connected ? 'pb-6 border-b border-border' : ''}`}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#7b68ee]/10 border border-[#7b68ee]/20 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="font-black text-xl text-[#7b68ee]">CU</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-foreground">ClickUp</h3>
                {connected ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                    Not Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically import your spaces, lists, tasks, subtasks, and checklists directly from ClickUp.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {connected ? (
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-all"
              >
                Disconnect
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => startOAuth('clickup')}
                  disabled={connectingProvider === 'clickup'}
                  className="px-5 py-2.5 text-xs font-black rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 active:scale-95 transition-all disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {connectingProvider === 'clickup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Sign in with ClickUp
                </button>
                <button
                  type="button"
                  onClick={() => setShowClickupTokenForm(v => !v)}
                  className="px-3 py-2.5 text-xs font-bold rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all inline-flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {showClickupTokenForm ? 'Hide Token' : 'Use API Token'}
                </button>
              </div>
            )}
          </div>
        </div>

        {!connected && showClickupTokenForm && (
          <form onSubmit={handleClickupTokenConnect} className="mt-4 pt-4 border-t border-border space-y-2.5">
            {oauthErrorBanner && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                {oauthErrorBanner}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={clickupTokenInput}
                onChange={e => setClickupTokenInput(e.target.value)}
                placeholder="Paste ClickUp Personal API Token (pk_...)"
                className="flex-1 bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={clickupTokenBusy || !clickupTokenInput.trim()}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {clickupTokenBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Connect Token
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Find this in ClickUp → Settings → Apps → API Token.
            </p>
          </form>
        )}

        {/* Connected state: Account info & Copy actions */}
        {connected && (
          <div className="pt-6 space-y-6">
            {/* User profile & Workspace pill */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-muted/30 border border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#7b68ee]/20 text-[#7b68ee] font-black flex items-center justify-center text-sm">
                  {user?.username ? user.username[0].toUpperCase() : 'CU'}
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">{user?.username || 'ClickUp User'}</p>
                  <p className="text-[11px] text-muted-foreground">{user?.email || 'Connected Account'}</p>
                </div>
              </div>

              {teams.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase">Workspace:</span>
                  <select
                    value={selectedTeamId}
                    onChange={e => setSelectedTeamId(e.target.value)}
                    className="bg-background border border-input rounded-xl px-3 py-1.5 text-xs font-bold text-foreground"
                  >
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quick Action: Copy Everything Over */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={() => handleImport(true)}
                disabled={importing}
                className="flex-1 py-3.5 px-6 rounded-2xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-[1.01] active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {importing ? 'Copying Things Over...' : 'Copy Everything Over (1-Click)'}
              </button>

              <button
                onClick={() => {
                  setShowCustomSelection(v => !v);
                  if (!showCustomSelection && spaces.length === 0) {
                    loadHierarchy();
                  }
                }}
                disabled={importing}
                className="py-3.5 px-5 rounded-2xl font-bold text-xs border border-border hover:border-primary/40 text-foreground bg-muted/40 hover:bg-muted/70 transition-all flex items-center justify-center gap-2"
              >
                <FolderKanban className="w-4 h-4 text-muted-foreground" />
                {showCustomSelection ? 'Hide List Selection' : 'Choose Specific Lists...'}
              </button>
            </div>

            {/* Live Importing progress */}
            {importing && (
              <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 space-y-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <span className="text-xs font-bold text-foreground">{importStep}</span>
                </div>
                <div className="w-full h-1.5 bg-primary/20 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-indeterminate" />
                </div>
              </div>
            )}

            {/* Success summary card */}
            {importResult && (
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-black text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Items Copied Over Successfully!</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {importResult.message}
                </p>
                {importResult.imported && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="p-3 bg-card rounded-xl border border-border text-center">
                      <p className="text-lg font-black text-foreground">{importResult.imported.tasks}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Tasks</p>
                    </div>
                    <div className="p-3 bg-card rounded-xl border border-border text-center">
                      <p className="text-lg font-black text-foreground">{importResult.imported.subtasks}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Subtasks</p>
                    </div>
                    <div className="p-3 bg-card rounded-xl border border-border text-center">
                      <p className="text-lg font-black text-foreground">{importResult.imported.checklists}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Checklists</p>
                    </div>
                    <div className="p-3 bg-card rounded-xl border border-border text-center">
                      <p className="text-lg font-black text-foreground">{importResult.imported.projects}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Projects</p>
                    </div>
                  </div>
                )}
                <div className="pt-2 flex gap-2">
                  <a
                    href="/projects"
                    className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-600 transition-all inline-flex items-center gap-1.5"
                  >
                    View in Projects <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href="/tasks"
                    className="px-4 py-2 bg-muted text-foreground rounded-xl text-xs font-bold hover:bg-muted/80 transition-all"
                  >
                    View in Tasks
                  </a>
                </div>
              </div>
            )}

            {/* Custom List Selection Tree */}
            {showCustomSelection && (
              <div className="p-5 rounded-2xl bg-muted/20 border border-border space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-foreground">Select Lists to Copy</h4>
                    <span className="text-[11px] text-muted-foreground">
                      ({selectedListIds.size} selected)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleSelectAllLists}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      {selectedListIds.size > 0 ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      onClick={loadHierarchy}
                      disabled={loadingHierarchy}
                      className="p-1 text-muted-foreground hover:text-foreground rounded"
                      title="Refresh lists"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingHierarchy ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {loadingHierarchy ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="text-xs font-semibold">Reading ClickUp spaces and lists...</span>
                  </div>
                ) : spaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No spaces or lists found. Click refresh above to reload.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {spaces.map(space => {
                      const isExpanded = expandedSpaces.has(space.id);
                      return (
                        <div key={space.id} className="border border-border/60 rounded-xl p-3 bg-card/60">
                          <button
                            type="button"
                            onClick={() => toggleSpaceExpand(space.id)}
                            className="w-full flex items-center justify-between text-left font-bold text-xs text-foreground hover:text-primary transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              {space.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {space.lists.length + space.folders.reduce((acc, f) => acc + f.lists.length, 0)} lists
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2.5 pl-5 space-y-1.5 border-l border-border/40">
                              {/* Direct lists in space */}
                              {space.lists.map(list => (
                                <label
                                  key={list.id}
                                  className="flex items-center justify-between p-1.5 rounded-lg hover:bg-muted/50 cursor-pointer text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedListIds.has(list.id)}
                                      onChange={() => toggleListId(list.id)}
                                      className="rounded border-border text-primary focus:ring-primary"
                                    />
                                    <span className="font-medium text-foreground">{list.name}</span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">
                                    {list.taskCount} tasks
                                  </span>
                                </label>
                              ))}

                              {/* Folders in space */}
                              {space.folders.map(folder => (
                                <div key={folder.id} className="pt-1">
                                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                                    📁 {folder.name}
                                  </p>
                                  <div className="pl-3 space-y-1">
                                    {folder.lists.map(list => (
                                      <label
                                        key={list.id}
                                        className="flex items-center justify-between p-1.5 rounded-lg hover:bg-muted/50 cursor-pointer text-xs"
                                      >
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={selectedListIds.has(list.id)}
                                            onChange={() => toggleListId(list.id)}
                                            className="rounded border-border text-primary focus:ring-primary"
                                          />
                                          <span className="font-medium text-foreground">{list.name}</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">
                                          {list.taskCount} tasks
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedListIds.size > 0 && (
                  <button
                    onClick={() => handleImport(false)}
                    disabled={importing}
                    className="w-full py-2.5 bg-primary text-primary-foreground font-black text-xs rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                  >
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Copy {selectedListIds.size} Selected List{selectedListIds.size > 1 ? 's' : ''} to Planora
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <TrelloCard onSignIn={() => startOAuth('trello')} signingIn={connectingProvider === 'trello'} />

      {/* 2. Universal File Import Card (ClickUp CSV / JSON) */}
      <div className="bg-card border-2 border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-foreground">Import from File</h3>
            <p className="text-xs text-muted-foreground">
              Have an export from ClickUp, Asana, Trello, or a spreadsheet? Upload your CSV or JSON file.
            </p>
          </div>
        </div>

        <div className="p-6 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 bg-muted/20 transition-all text-center">
          <input
            type="file"
            id="import-file-input"
            accept=".csv,.json"
            onChange={handleFileUpload}
            className="hidden"
          />
          <label htmlFor="import-file-input" className="cursor-pointer block space-y-2">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-xs font-bold text-foreground">
              {fileName ? fileName : 'Choose ClickUp CSV or JSON export to upload'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Click to browse your computer (.csv, .json)
            </p>
          </label>
        </div>

        {fileContent && (
          <div className="mt-4 p-4 rounded-2xl bg-muted/30 border border-border space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-foreground">Found {fileContent.length} tasks in file</span>
              <span className="text-muted-foreground">{fileName}</span>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground mb-1">Target Project Name</label>
              <input
                type="text"
                value={fileProjectName}
                onChange={e => setFileProjectName(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs font-semibold"
                placeholder="e.g. Imported Tasks"
              />
            </div>
            <button
              onClick={handleProcessFileImport}
              disabled={fileImporting}
              className="w-full py-2.5 bg-primary text-primary-foreground font-black text-xs rounded-xl shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
            >
              {fileImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {fileImporting ? 'Importing Tasks...' : `Import ${fileContent.length} Tasks into Planora`}
            </button>
          </div>
        )}
      </div>

      {/* 3. Other Tools Coming Soon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {[
          { name: 'Asana', desc: 'Copy projects, sections, and tasks' },
          { name: 'Notion', desc: 'Import database pages and to-do lists' },
        ].map((tool, i) => (
          <div key={i} className="p-4 rounded-2xl border border-border bg-card/60 opacity-75">
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-black text-foreground">{tool.name}</h4>
              <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Coming Soon
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{tool.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}



function TrelloCard({ onSignIn, signingIn }: { onSignIn: () => void; signingIn: boolean }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<{ connected: boolean; accountName?: string; accountEmail?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [connectingToken, setConnectingToken] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/integrations/trello/status', { credentials: 'include' });
      setStatus(await res.json());
    } catch {
      setStatus({ connected: false });
    }
  };

  useEffect(() => {
    void load();
    const onConnected = () => void load();
    window.addEventListener('trello-connected', onConnected);
    return () => window.removeEventListener('trello-connected', onConnected);
  }, []);

  const sync = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/trello/import', { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Import failed');
      toast({ title: 'Trello synced', description: data.message });
    } catch (err: any) {
      toast({ title: 'Trello sync failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const connectWithToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setConnectingToken(true);
    try {
      const res = await fetch('/api/integrations/trello/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey: apiKeyInput.trim(), token: tokenInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to connect Trello');
      setTokenInput('');
      setApiKeyInput('');
      setShowTokenForm(false);
      toast({ title: 'Trello connected', description: `Signed in as ${data.accountName || 'Trello user'}.` });
      await load();
    } catch (err: any) {
      toast({ title: 'Trello connect failed', description: err.message, variant: 'destructive' });
    } finally {
      setConnectingToken(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect your Trello account? Your already-imported tasks in Planora will remain.')) return;
    await fetch('/api/integrations/trello/disconnect', { method: 'POST', credentials: 'include' }).catch(() => {});
    setStatus({ connected: false });
  };

  const connected = !!status?.connected;
  return (
    <div className="bg-card border-2 border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:border-primary/30">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0079bf]/10 border border-[#0079bf]/20 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="font-black text-xl text-[#0079bf]">T</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-foreground">Trello</h3>
              {connected ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {connected
                ? `Signed in as ${status?.accountName || status?.accountEmail || 'Trello user'}. Boards become projects, cards become tasks.`
                : 'Sign in and every board, list, card and checklist is imported automatically.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <button
                onClick={sync}
                disabled={busy}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-border text-foreground hover:bg-muted transition-all inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sync now
              </button>
              <button
                onClick={disconnect}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-all"
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onSignIn}
                disabled={signingIn}
                className="px-5 py-2.5 text-xs font-black rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 active:scale-95 transition-all disabled:opacity-60 inline-flex items-center gap-2"
              >
                {signingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                Sign in with Trello
              </button>
              <button
                type="button"
                onClick={() => setShowTokenForm(v => !v)}
                className="px-3 py-2.5 text-xs font-bold rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all inline-flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {showTokenForm ? 'Hide Token' : 'Use API Token'}
              </button>
            </>
          )}
        </div>
      </div>

      {!connected && showTokenForm && (
        <form onSubmit={connectWithToken} className="mt-4 pt-4 border-t border-border space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              placeholder="Trello API Key (optional for Bearer tokens)"
              className="bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary"
            />
            <input
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="Paste Trello Token or OAuth Access Token"
              className="bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Get your Power-Up API Key & Token from trello.com/power-ups/admin.
            </p>
            <button
              type="submit"
              disabled={connectingToken || !tokenInput.trim()}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5 flex-shrink-0"
            >
              {connectingToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Connect Trello
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
