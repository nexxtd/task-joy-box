import '@/styles/pagePanels.css';
import { dateLocale } from '@/i18n/format';
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PLAN_LIMITS, normalizePlanTier, getLimitButtonProps } from '@/lib/planLimits';
import {
  Palette, Bell, Globe, Battery, Keyboard,
  Moon, Sun, Monitor, LogOut, User, Shield, CheckCircle,
  Link2, Link2Off, RefreshCw, ExternalLink, Sparkles, Zap,
  History, Brain, CheckCircle2, X, XCircle, Clock, MessageSquare, Dot, TrendingUp, Trash2, Plus,
  LayoutDashboard, FolderKanban, ListTodo, BarChart3, StickyNote, Bot, Users, LifeBuoy,
  Newspaper, CreditCard, Settings as SettingsIcon, FilePlus2, Search, RotateCcw, AlertTriangle, PenLine,
  PlayCircle, Building2
} from 'lucide-react';
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, SHORTCUT_CATEGORY_LABELS, CREATE_SPLIT_SCREEN_ACTION_ID, loadShortcuts, saveShortcuts, normalizeCombo, beginShortcutCapture, endShortcutCapture, type ShortcutDef, type ShortcutAction, type ShortcutCategory } from '@/lib/shortcuts';
import { APP_PAGES, findAppPage } from '@/lib/appPages';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useBoardContext } from '@/context/BoardContext';
import { useLanguage } from '@/context/LanguageContext';
import { LANGUAGES, canonicalLanguageCode, resolveLanguageCode } from '@/i18n/translations';
import { EnergyInsightsBody } from '@/components/insights/EnergyInsightsWidget';
import EnergyLog from '@/components/EnergyLog';
import SupportContent from '@/components/SupportContent';
import DiscordCommunitySection from '@/components/shared/DiscordCommunitySection';
import IntegrationsSection from '@/components/settings/IntegrationsSection';
import { notificationsSupported, notificationPermission, requestNotificationPermission, deviceNotify, sendTestNotification, setSmartAlertsEnabled } from '@/lib/notifications';
import TicketConversation, { TicketData, TicketMessage } from '@/components/TicketConversation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { applyAccentHsl, normalizeAccent } from '@/lib/accent';
import { applyFontFamily, ensureFontLoaded } from '@/lib/fonts';
import { ColorPicker, ConfigProvider, theme as antdTheme } from 'antd';
import { trackUsage, trackPageVisit } from '@/lib/usage';

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

// Inline Google "G" mark (replaces react-icons so the icon library stays out
// of the bundle — this was its only usage).
const GoogleGIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z" />
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.4 24 12 24z" />
    <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.7 0 10.2 0 12s.5 3.3 1.4 4.7l3.8-2.3z" />
    <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.5 2.7 1.4 6.8l3.8 2.9c1-2.9 3.7-5 6.8-5z" />
  </svg>
);

const FONTS = ['Inter', 'Nunito', 'Outfit', 'Roboto'];

const hexToHsl = (hex: string) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex[1] + hex[2], 16);
    g = parseInt(hex[3] + hex[4], 16);
    b = parseInt(hex[5] + hex[6], 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const ACCENT_COLORS = [
  { hex: '#000000', hsl: '0 0% 0%', label: 'Black' },
  { hex: '#2563EB', hsl: '220 89% 56%', label: 'Blue' },
  { hex: '#7C3AED', hsl: '263 70% 50%', label: 'Purple' },
  { hex: '#059669', hsl: '161 94% 30%', label: 'Green' },
  { hex: '#D97706', hsl: '38 92% 50%', label: 'Amber' },
  { hex: '#DC2626', hsl: '0 72% 51%', label: 'Red' },
  { hex: '#DB2777', hsl: '330 81% 51%', label: 'Pink' },
];

const SettingsPage: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { board, addTask } = useBoardContext();
  const { lang, setLanguage, t } = useLanguage(); // Use language context
  const [activeSection, setActiveSection] = useState('appearance');
  const [selectedTheme, setSelectedTheme] = useState(theme);
  const [font, setFont] = useState(() => localStorage.getItem('font') || 'Inter');
  // Remove local language state since we're using context
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('accentColor') || '#000000');
  const [normalAlerts, setNormalAlerts] = useState(() => localStorage.getItem('normalAlerts') !== 'false');
  const [smartAlerts, setSmartAlerts] = useState(() => localStorage.getItem('smartAlerts') !== 'false');
  const [emailNotifs, setEmailNotifs] = useState(() => localStorage.getItem('emailNotifs') !== 'false');
  const [weeklyAiSummary, setWeeklyAiSummary] = useState(() => localStorage.getItem('weeklyAiSummary') !== 'false');
  const [summarySending, setSummarySending] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState('');
  const [energyTrackerEnabled, setEnergyTrackerEnabled] = useState(() => localStorage.getItem('energyTrackerEnabled') !== 'false');
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default'>(() =>
    notificationsSupported() ? notificationPermission() : 'denied'
  );
  const [saved, setSaved] = useState(false);
  const [notifError, setNotifError] = useState('');
  const [enablingNotif, setEnablingNotif] = useState(false);
  const [notifNotice, setNotifNotice] = useState('');
  const [savingSmart, setSavingSmart] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingNormal, setSavingNormal] = useState(false);
  const [savingWeeklyAi, setSavingWeeklyAi] = useState(false);

  // 2FA Disable Modal State
  const [disable2faModalOpen, setDisable2faModalOpen] = useState(false);
  const [disable2faCode, setDisable2faCode] = useState('');
  const [disable2faLoading, setDisable2faLoading] = useState(false);
  const [disable2faError, setDisable2faError] = useState('');
  const [disable2faSending, setDisable2faSending] = useState(false);

  // Organization Tab State
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [joinedOrgs, setJoinedOrgs] = useState<any[]>([]);
  const [ownedOrgs, setOwnedOrgs] = useState<any[]>([]);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');

  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarConfigured, setCalendarConfigured] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarRedirectUri, setCalendarRedirectUri] = useState('');
  const [syncStatus, setSyncStatus] = useState<{ synced: number; total: number } | null>(null);
  const [syncError, setSyncError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');
  const [historyTab, setHistoryTab] = useState<'energy' | 'deepfocus'>('deepfocus');
  const [deepFocusSessions, setDeepFocusSessions] = useState<any[]>([]);
  const [deepFocusLoading, setDeepFocusLoading] = useState(false);
  const navigate = useNavigate();
  const planTier = normalizePlanTier(user?.subscriptionTier);
  const isPaid = planTier === 'pro' || planTier === 'premium';
  const isTopTier = planTier === 'pro';
  const isMidTier = planTier === 'premium';

  const [userTickets, setUserTickets] = useState<TicketData[]>([]);
  const [hasTickets, setHasTickets] = useState(false);
  const [ticketsLoaded, setTicketsLoaded] = useState(false);
  const [activePanelTicket, setActivePanelTicket] = useState<TicketData | null>(null);
  const [panelMessages, setPanelMessages] = useState<TicketMessage[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [ticketTab, setTicketTab] = useState<'open' | 'resolved'>('open');
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketCategory, setTicketCategory] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  // Shortcuts — pre-loaded defaults to every page + Create Task / Create Note.
  const [shortcuts, setShortcuts] = useState<ShortcutDef[]>(() => loadShortcuts());
  const maxCustomShortcuts = PLAN_LIMITS.shortcuts[planTier];
  const customShortcutsCount = useMemo(() => shortcuts.filter(s => !DEFAULT_SHORTCUTS.some(d => d.id === s.id)).length, [shortcuts]);
  const isShortcutLimitReached = customShortcutsCount >= maxCustomShortcuts;
  const [rebindingId, setRebindingId] = useState<string | null>(null);
  const [rebindError, setRebindError] = useState('');
  const [addShortcutOpen, setAddShortcutOpen] = useState(false);
  const [newShortcutTitle, setNewShortcutTitle] = useState('');
  const [newShortcutKeys, setNewShortcutKeys] = useState('');
  const [newShortcutAction, setNewShortcutAction] = useState(SHORTCUT_ACTIONS[0].id);
  const [newShortcutSplitLeft, setNewShortcutSplitLeft] = useState('');
  const [newShortcutSplitRight, setNewShortcutSplitRight] = useState('');
  const [capturingNewKeys, setCapturingNewKeys] = useState(false);
  const [newShortcutError, setNewShortcutError] = useState('');
  const splitActionSelected = newShortcutAction === CREATE_SPLIT_SCREEN_ACTION_ID;
  const splitPagesReady =
    !splitActionSelected ||
    (!!newShortcutSplitLeft && !!newShortcutSplitRight && newShortcutSplitLeft !== newShortcutSplitRight);

  const persistShortcuts = (next: ShortcutDef[]) => {
    setShortcuts(next);
    saveShortcuts(next);
  };

  const setAllShortcutsEnabled = (enabled: boolean) => {
    persistShortcuts(shortcuts.map(s => ({ ...s, enabled })));
    trackUsage('settings', enabled ? 'enable-all-shortcuts' : 'disable-all-shortcuts');
  };

  const findShortcutWithKeys = (combo: string, exceptId?: string) => {
    const want = normalizeCombo(combo).toLowerCase();
    if (!want) return undefined;
    return shortcuts.find(s => s.id !== exceptId && normalizeCombo(s.keys).toLowerCase() === want);
  };

  useEffect(() => {
    if (!rebindingId) return;
    beginShortcutCapture();
    setRebindError('');
    const onKey = (e: KeyboardEvent) => {
      // Capture phase: swallow everything so existing shortcuts don't fire mid-rebind.
      // Never navigate to / run the existing shortcut while capturing.
      e.preventDefault();
      e.stopPropagation();
      // Escape cancels the rebind.
      if (e.key === 'Escape') { setRebindingId(null); setRebindError(''); return; }
      // Modifier-only keydown (user pressed Alt/Ctrl/Shift first) — keep
      // listening for the rest of the chord instead of cancelling.
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const combo = normalizeCombo(e);
      // Incomplete combo (e.g. a plain key with no modifier) — keep waiting
      // rather than dropping out of rebind mode.
      if (!combo || combo === 'Escape') return;
      const clash = findShortcutWithKeys(combo, rebindingId);
      if (clash) {
        setRebindError(`That keybind is already in use in shortcut "${clash.title}".`);
        return;
      }
      setRebindError('');
      setShortcuts(prev => {
        const next = prev.map(s => s.id === rebindingId ? { ...s, keys: combo } : s);
        saveShortcuts(next);
        return next;
      });
      trackUsage('settings', 'rebind-shortcut');
      setRebindingId(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      endShortcutCapture();
    };
  }, [rebindingId]);

  useEffect(() => {
    if (!capturingNewKeys) return;
    beginShortcutCapture();
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setCapturingNewKeys(false); return; }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const combo = normalizeCombo(e);
      if (!combo || combo === 'Escape') return;
      const clash = findShortcutWithKeys(combo);
      if (clash) {
        setNewShortcutError(`That keybind is already in use in shortcut "${clash.title}".`);
        return;
      }
      setNewShortcutError('');
      setNewShortcutKeys(combo);
      setCapturingNewKeys(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      endShortcutCapture();
    };
  }, [capturingNewKeys]);

  const sections = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'integrations', label: 'Connected Accounts', icon: Link2 },
    { id: 'energy', label: 'Energy Levels', icon: Battery },
    { id: 'history', label: 'History', icon: History },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'account', label: 'Account', icon: User },
    { id: 'security', label: 'Privacy', icon: Shield },
    { id: 'organization', label: 'Organization', icon: Building2 },
    { id: 'tickets', label: 'Tickets', icon: MessageSquare },
  ];

  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && sections.some(s => s.id === tab)) {
      setActiveSection(tab);
    }
  }, [location.search]);

  const fetchOrganizations = async () => {
    setOrgsLoading(true);
    try {
      const res = await fetch('/api/organizations', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setJoinedOrgs(data.joinedOrganizations || []);
        setOwnedOrgs(data.organizations || []);
      }
    } catch (e) {
      console.error('Failed to load organizations', e);
    } finally {
      setOrgsLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'organization') {
      fetchOrganizations();
      refreshUser();
    }
  }, [activeSection]);

  const fetchUserTickets = async () => {
    try {
      const res = await fetch('/api/support/tickets/my', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setUserTickets(list);
        setHasTickets(list.length > 0);
        setTicketsLoaded(true);
      } else {
        setTicketsLoaded(true);
      }
    } catch {
      setTicketsLoaded(true);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchUserTickets();
    trackPageVisit('settings');
    fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()).then(d => { if (d?.user) setTwoFactorEnabled(!!d.user.twoFactorEnabled); }).catch(() => {});
  }, []);

  useEffect(() => {
    // Keep the permission badge honest if the user changes the browser's
    // notification setting in another tab and comes back.
    const refreshPermission = () => {
      setNotifPermission(notificationsSupported() ? notificationPermission() : 'denied');
    };
    window.addEventListener('focus', refreshPermission);
    document.addEventListener('visibilitychange', refreshPermission);
    return () => {
      window.removeEventListener('focus', refreshPermission);
      document.removeEventListener('visibilitychange', refreshPermission);
    };
  }, []);

  useEffect(() => {
    if (activeSection === 'tickets') fetchUserTickets();
  }, [activeSection]);

  useEffect(() => {
    if (!activePanelTicket) return;
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/support/tickets/${activePanelTicket.id}/messages`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setPanelMessages(data.messages || []);
          setActivePanelTicket(prev => prev ? { ...prev, ...data.ticket } : null);
          setUserTickets(prev => prev.map(t => t.id === data.ticket.id ? { ...t, ...data.ticket } : t));
        }
      } catch {}
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [activePanelTicket?.id]);

  const handleSendTicketMessage = async (text: string, file?: File | null) => {
    if (!activePanelTicket) return;
    if (!text.trim() && !file) return;
    setSendingMessage(true);
    try {
      const form = new FormData();
      if (text.trim()) form.append('message', text.trim());
      if (file) form.append('file', file);
      const res = await fetch(`/api/support/tickets/${activePanelTicket.id}/messages`, {
        method: 'POST',
        credentials: 'include',
        body: form as any,
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.message) {
          setPanelMessages(prev => [...prev, { ...data.message, senderName: user?.name || 'You' }]);
        }
        const refetch = await fetch(`/api/support/tickets/${activePanelTicket.id}/messages`, { credentials: 'include' });
        if (refetch.ok) {
          const msgs = await refetch.json();
          setPanelMessages(msgs.messages || []);
          setActivePanelTicket(prev => prev ? { ...prev, ...msgs.ticket } : null);
          setUserTickets(prev => prev.map(t => t.id === msgs.ticket.id ? { ...t, ...msgs.ticket } : t));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Failed to send message', err);
      }
    } catch {} finally {
      setSendingMessage(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.theme) {
          setSelectedTheme(data.theme);
          // Apply theme logic if needed
        }
        if (data.fontFamily) {
          setFont(data.fontFamily);
          applyFontFamily(data.fontFamily);
        }
        if (data.accentColor || data.accentHsl) {
          const { hex, hsl } = normalizeAccent(data.accentColor, data.accentHsl);
          setAccentColor(hex);
          applyAccentHsl(hsl);
        }
        // Language: the account is the source of truth (other devices,
        // refresh, post-logout). Adopt the server value when present so a
        // saved pick never reverts to a stale local value. Only language
        // CODES (en, zh, ...) are stored — legacy display names ("中文")
        // from old accounts are normalized on read.
        try {
          if (data.language) {
            const serverCode = resolveLanguageCode(data.language);
            if (serverCode === null) {
              // Invalid account value: fall back to English and repair it.
              setLanguage('en');
            } else {
              setLanguage(serverCode);
            }
          } else {
            try {
              const localRaw = localStorage.getItem('language');
              if (localRaw) setLanguage(canonicalLanguageCode(localRaw));
            } catch {}
          }
        } catch {
          if (data.language) {
            try { setLanguage(data.language); } catch {}
          }
        }
        setNormalAlerts(data.normalAlerts !== false);
        setSmartAlerts(data.smartAlerts !== false);
        setEmailNotifs(data.emailNotifs !== false);
        setWeeklyAiSummary(data.weeklyAiSummary !== false);
        // The notifier reads these from localStorage; mirror the account so
        // the preference set on another device applies here too.
        try {
          localStorage.setItem('normalAlerts', String(data.normalAlerts !== false));
          setSmartAlertsEnabled(data.smartAlerts !== false);
          localStorage.setItem('emailNotifs', String(data.emailNotifs !== false));
          localStorage.setItem('weeklyAiSummary', String(data.weeklyAiSummary !== false));
        } catch {}
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  useEffect(() => {
    const savedFont = localStorage.getItem('font');
    if (savedFont) applyFontFamily(savedFont);
  }, []);

  useEffect(() => {
    if (activeSection === 'history' && historyTab === 'deepfocus') fetchDeepFocusSessions();
  }, [activeSection, historyTab]);

  const fetchDeepFocusSessions = async () => {
    setDeepFocusLoading(true);
    try {
      const res = await fetch('/api/deep-focus/sessions', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDeepFocusSessions(data);
      }
    } catch {}
    finally { setDeepFocusLoading(false); }
  };

  const fetchCalendarStatus = async () => {
    try {
      const res = await fetch('/api/calendar/status', { credentials: 'include' });
      const data = await res.json();
      setCalendarConnected(data.connected);
      setCalendarConfigured(data.configured);
      if (data.redirectUri) setCalendarRedirectUri(data.redirectUri);
    } catch {}
  };

  const connectCalendar = async () => {
    setCalendarLoading(true);
    setSyncError('');
    try {
      const res = await fetch('/api/calendar/auth', { credentials: 'include' });
      const data = await res.json();
      if (data.redirectUri) setCalendarRedirectUri(data.redirectUri);
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setSyncError(data.error || 'Failed to start Google Calendar connection');
      }
    } catch {
      setSyncError('Failed to connect to server');
    } finally {
      setCalendarLoading(false);
    }
  };

  const disconnectCalendar = async () => {
    setCalendarLoading(true);
    try {
      await fetch('/api/calendar/disconnect', { method: 'DELETE', credentials: 'include' });
      setCalendarConnected(false);
      setSyncStatus(null);
    } catch {
      setSyncError('Failed to disconnect');
    } finally {
      setCalendarLoading(false);
    }
  };

  const syncToGoogle = async () => {
    setCalendarLoading(true);
    setSyncError('');
    setSyncStatus(null);
    try {
      const tasks = board.tasks.map(t => ({
        title: t.title,
        description: t.description || '',
        dueDate: t.dueDate,
      }));
      const res = await fetch('/api/calendar/sync-to-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tasks }),
      });
      const data = await res.json();
      if (res.ok) setSyncStatus(data);
      else setSyncError(data.error || 'Sync failed');
    } catch {
      setSyncError('Sync failed');
    } finally {
      setCalendarLoading(false);
    }
  };

  const syncFromGoogle = async () => {
    setCalendarLoading(true);
    setSyncError('');
    setSyncSuccess(''); // Clear previous success message
    
    try {
      const res = await fetch('/api/calendar/sync-from-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      
      if (res.ok) {
        // Process the events received from Google Calendar and add them as tasks
        // Only add tasks that don't already exist
        let importedCount = 0;
        data.events.forEach((event: any) => {
          // Check if a task with this title and date already exists
          const exists = board.tasks.some(task => 
            task.title === event.title && task.dueDate === event.startDate
          );
          
          if (!exists) {
            addTask('todo', event.title, { 
              description: event.description, 
              priority: 'medium', 
              dueDate: event.startDate 
            });
            importedCount++;
          }
        });
        
        // Set success message
        setSyncSuccess(`Successfully imported ${importedCount} new events from Google Calendar (${data.count} total events found)`);
      } else {
        setSyncError(data.error || 'Failed to sync from Google');
      }
    } catch (err) {
      setSyncError('Error syncing from Google Calendar');
    } finally {
      setCalendarLoading(false);
    }
  };

  const applyFont = async (f: string) => {
    applyFontFamily(f);
    setFont(f);
    
    // Auto-save to backend
    if (isPaid) {
      try {
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fontFamily: f }),
        });
        showSaved();
      } catch (error) {
        console.error('Error saving font:', error);
      }
    }
  };

  const applyAccentColor = async (hex: string, hsl: string) => {
    applyAccentHsl(hsl);
    setAccentColor(hex);
    localStorage.setItem('accentColor', hex);
    localStorage.setItem('accentHsl', hsl);
    
    // Auto-save to backend
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accentColor: hex, accentHsl: hsl }),
      });
      showSaved();
    } catch (error) {
      console.error('Error saving accent color:', error);
    }
  };

  const handleThemeChange = async (id: string) => {
    trackUsage('settings', 'change-theme');
    setSelectedTheme(id as any);
    if (id === 'light' && theme === 'dark') toggleTheme();
    if (id === 'dark' && theme === 'light') toggleTheme();
    if (id === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark && theme === 'light') toggleTheme();
      if (!prefersDark && theme === 'dark') toggleTheme();
    }
    
    // Auto-save to backend
    if (isPaid) {
      try {
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ theme: id }),
        });
        showSaved();
      } catch (error) {
        console.error('Error saving theme:', error);
      }
    }
  };

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const sendSummaryNow = async () => {
    setSummarySending(true);
    setSummaryMessage('');
    try {
      const res = await fetch('/api/cron/weekly-ai-summary/send-now', { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSummaryMessage('Summary sent to your email.');
      else setSummaryMessage(data.error || 'Failed to send summary');
    } catch {
      setSummaryMessage('Failed to send summary');
    } finally {
      setSummarySending(false);
    }
  };

  const persistNotificationPrefs = async (
    patch: { normalAlerts?: boolean; smartAlerts?: boolean; emailNotifs?: boolean; weeklyAiSummary?: boolean },
    prev: { normalAlerts?: boolean; smartAlerts: boolean; emailNotifs: boolean; weeklyAiSummary?: boolean },
  ) => {
    setNotifError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      showSaved();
    } catch (error) {
      // Revert the toggle and surface the error.
      if (patch.normalAlerts !== undefined && prev.normalAlerts !== undefined) {
        setNormalAlerts(prev.normalAlerts);
        try { localStorage.setItem('normalAlerts', String(prev.normalAlerts)); } catch {}
      }
      if (patch.smartAlerts !== undefined) {
        setSmartAlerts(prev.smartAlerts);
        setSmartAlertsEnabled(prev.smartAlerts);
      }
      if (patch.emailNotifs !== undefined) {
        setEmailNotifs(prev.emailNotifs);
        try { localStorage.setItem('emailNotifs', String(prev.emailNotifs)); } catch {}
      }
      if (patch.weeklyAiSummary !== undefined && prev.weeklyAiSummary !== undefined) {
        setWeeklyAiSummary(prev.weeklyAiSummary);
        try { localStorage.setItem('weeklyAiSummary', String(prev.weeklyAiSummary)); } catch {}
      }
      setNotifError('Could not save. Please try again.');
    } finally {
      setSavingSmart(false);
      setSavingEmail(false);
    }
  };

  const enableDeviceNotifications = async () => {
    setEnablingNotif(true);
    setNotifError('');
    setNotifNotice('');
    try {
      if (!notificationsSupported()) {
        setNotifError('Device notifications are not supported in this browser.');
        return;
      }
      await requestNotificationPermission();
      const perm = notificationPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        deviceNotify(
          'Smart Alerts are on',
          'You will now get alerts for overdue tasks, due deadlines and energy checks.',
          'smart-alerts-welcome',
        );
        setNotifNotice('Device notifications enabled on this device.');
      } else if (perm === 'denied') {
        setNotifError('Notifications are blocked. Allow them for this site in your browser settings, then try again.');
      } else {
        setNotifNotice('Notification permission was not granted. You can enable it any time.');
      }
    } catch {
      setNotifError('Could not request notification permission.');
    } finally {
      setEnablingNotif(false);
    }
  };

  const handleSendTestNotification = () => {
    setNotifError('');
    setNotifNotice('');
    if (sendTestNotification()) {
      setNotifNotice('Test notification sent — check your notification center.');
    } else {
      setNotifError('Could not send a notification. Check that notifications are allowed for this site.');
    }
  };

  const handleSmartAlertsToggle = async () => {
    if (!isPaid) {
      window.location.href = '/pricing';
      return;
    }
    const prev = smartAlerts;
    const next = !prev;
    setSmartAlerts(next);
    setSmartAlertsEnabled(next);
    setNotifError('');
    setNotifNotice('');
    setSavingSmart(true);
    if (next && notificationsSupported()) {
      // Ask for permission the moment the user opts in, then confirm with a
      // real device notification once it is granted.
      if (notificationPermission() === 'default') {
        await requestNotificationPermission();
      }
      const perm = notificationPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        deviceNotify(
          'Smart Alerts enabled',
          'You will get alerts for overdue tasks, due deadlines and energy checks.',
          'smart-alerts-welcome',
        );
      }
    }
    await persistNotificationPrefs({ smartAlerts: next }, { smartAlerts: prev, emailNotifs });
  };

  const handleNormalAlertsToggle = async () => {
    const prev = normalAlerts;
    const next = !prev;
    setNormalAlerts(next);
    try { localStorage.setItem('normalAlerts', String(next)); } catch {}
    await persistNotificationPrefs({ normalAlerts: next }, { normalAlerts: prev, smartAlerts, emailNotifs, weeklyAiSummary });
  };

  const handleEmailNotifsToggle = async () => {
    if (!isPaid) {
      window.location.href = '/pricing';
      return;
    }
    const prev = emailNotifs;
    const next = !prev;
    setEmailNotifs(next);
    try { localStorage.setItem('emailNotifs', String(next)); } catch {}
    setSavingEmail(true);
    await persistNotificationPrefs({ emailNotifs: next }, { smartAlerts, emailNotifs: prev });
  };

  const handleWeeklyAiSummaryToggle = async () => {
    if (!isTopTier) {
      window.location.href = '/pricing';
      return;
    }
    const prev = weeklyAiSummary;
    const next = !prev;
    setWeeklyAiSummary(next);
    try { localStorage.setItem('weeklyAiSummary', String(next)); } catch {}
    await persistNotificationPrefs({ weeklyAiSummary: next }, { smartAlerts, emailNotifs, weeklyAiSummary: prev });
  };

  const resetDefaults = async () => {
    // Reset local state
    setNormalAlerts(true);
    setSmartAlerts(true);
    setEmailNotifs(true);
    setWeeklyAiSummary(true);
    setEnergyTrackerEnabled(true);
    setLanguage('en');
    setFont('Inter');
    setAccentColor('#000000');
    setSelectedTheme('light');
    
    // Clear all settings from localStorage except essential auth data
    const authData = {
      token: localStorage.getItem('token'),
      session: localStorage.getItem('session'),
    };
    // Never replay the onboarding tutorial just because settings were reset.
    const tutorialCompleted = localStorage.getItem('tutorial_completed');

    localStorage.clear();

    // Restore essential auth data
    if (authData.token) localStorage.setItem('token', authData.token);
    if (authData.session) localStorage.setItem('session', authData.session);
    if (tutorialCompleted) localStorage.setItem('tutorial_completed', tutorialCompleted);
    
    // Apply default settings to localStorage
    localStorage.setItem('normalAlerts', 'true');
    localStorage.setItem('emailNotifs', 'true');
    localStorage.setItem('weeklyAiSummary', 'true');
    setSmartAlertsEnabled(true);
    localStorage.setItem('energyTrackerEnabled', 'true');
    localStorage.setItem('language', 'en');
    localStorage.setItem('font', 'Inter');
    localStorage.setItem('accentColor', '#000000');
    localStorage.setItem('accentHsl', '0 0% 0%');
    
    // Apply the settings to the DOM
    applyFontFamily('Inter');
    document.documentElement.style.setProperty('--primary', '0 0% 0%');
    document.documentElement.style.setProperty('--ring', '0 0% 0%');
    document.documentElement.style.setProperty('--sidebar-primary', '0 0% 0%');
    document.documentElement.style.setProperty('--sidebar-ring', '0 0% 0%');
    
    // Reset backend settings too
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          theme: 'system',
          fontFamily: 'Inter',
          accentColor: '#000000',
          accentHsl: '0 0% 0%',
          language: 'en',
          normalAlerts: true,
          smartAlerts: true,
          emailNotifs: true,
          weeklyAiSummary: true,
        }),
      });
    } catch (error) {
      console.error('Error resetting backend settings:', error);
    }
    
    showSaved();
  };

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const tasksWithDates = board.tasks.filter(t => t.dueDate).length;

  return (
    <div className="min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden">
      <header className="px-4 sm:px-6 py-2 min-h-16 border-b border-border flex items-center justify-between gap-2 flex-shrink-0 bg-background">
        <h1 className="text-base font-bold text-foreground truncate">Settings</h1>
        {saved && (
          <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 animate-fade-in">
            <CheckCircle className="w-3.5 h-3.5" /> Saved
          </div>
        )}
      </header>

      <div className="settings-panel-layout flex flex-1 min-h-0 overflow-hidden">
        {/* Section tabs — horizontal scroll chips on phones, sidebar on desktop */}
        <div className="settings-section-chips min-w-0 flex-shrink-0 border-b border-border px-3 py-2 gap-1.5 overflow-x-auto overscroll-contain">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              aria-pressed={activeSection === s.id}
              className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-semibold rounded-xl whitespace-nowrap transition-all flex-shrink-0 ${
                activeSection === s.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground bg-muted/50'
              }`}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </button>
          ))}
        </div>
        <div className="settings-section-sidebar min-h-0 w-48 border-r border-border p-4 space-y-0.5 flex-shrink-0 overflow-y-auto">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              data-testid={`settings-nav-${s.id}`}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                activeSection === s.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </button>
          ))}
        </div>

        <div className="settings-panel-content flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl">
          {activeSection === 'appearance' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Theme</h2>
                <div className="flex flex-wrap gap-3">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => isPaid ? handleThemeChange(t.id) : window.location.href = '/pricing'}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all duration-200 ${
                        selectedTheme === t.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      } ${!isPaid && 'opacity-70'}`}
                    >
                      <t.icon className="w-4 h-4" />
                      <span className="text-sm">{t.label}</span>
                      {!isPaid && <Sparkles className="w-3 h-3 text-primary ml-1" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Accent Color</h2>
                <div className="flex gap-3 flex-wrap items-center">
                  {ACCENT_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => applyAccentColor(c.hex, c.hsl)}
                      title={c.label}
                      className={`w-8 h-8 rounded-full transition-all duration-200 ${
                        accentColor.toUpperCase() === c.hex.toUpperCase() ? 'ring-2 ring-offset-2 ring-offset-background scale-110 ring-foreground/30' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>

                {isPaid ? (
                  <ConfigProvider
                    theme={{
                      algorithm: document.documentElement.classList.contains('dark')
                        ? antdTheme.darkAlgorithm
                        : antdTheme.defaultAlgorithm,
                      token: { borderRadius: 12 },
                    }}
                  >
                    <ColorPicker
                      value={accentColor}
                      onChange={(color) => {
                        const hex = color.toHexString();
                        applyAccentColor(hex, hexToHsl(hex));
                      }}
                      showText={false}
                      disabledAlpha
                      defaultFormat="hex"
                      presets={[{ label: 'Presets', colors: ACCENT_COLORS.map(c => c.hex) }]}
                    >
                      <button
                        type="button"
                        title="Pick a custom colour"
                        className="mt-3 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/40 transition-all"
                      >
                        <span
                          className="w-4 h-4 rounded-full ring-2 ring-offset-1 ring-offset-background"
                          style={{ backgroundColor: accentColor }}
                        />
                        <span className="text-sm font-medium text-foreground">Custom Colour</span>
                      </button>
                    </ColorPicker>
                  </ConfigProvider>
                ) : (
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/pricing'; }}
                    title="Custom colour (Premium)"
                    className="mt-3 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/40 transition-all"
                  >
                    <span
                      className="w-4 h-4 rounded-full ring-2 ring-offset-1 ring-offset-background"
                      style={{ backgroundColor: accentColor }}
                    />
                    <span className="text-sm font-medium text-foreground">Custom Colour</span>
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </button>
                )}

                {!isPaid && (
                  <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-xs text-primary font-medium flex items-center gap-2">
                      <Sparkles className="w-3 h-3" /> Premium Feature: pick any custom accent colour with the colour wheel.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Font Family</h2>
                <div className="flex flex-wrap gap-2">
                  {FONTS.map(f => (
                    <button
                      key={f}
                      onClick={() => isPaid ? applyFont(f) : window.location.href = '/pricing'}
                      className={`px-4 py-2 text-sm rounded-lg border transition-all duration-200 ${
                        font === f
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      } ${!isPaid && 'opacity-70'}`}
                      style={{ fontFamily: f }}
                    >
                      {f}
                      {!isPaid && <Sparkles className="w-3 h-3 text-primary ml-1 inline-block" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Language</h2>
                <Select
                  value={lang}
                  onValueChange={(newLanguage) => {
                    // newLanguage is a language CODE (en, zh, ...). The labels
                    // show the native display name ("中文"), but only the code
                    // is ever stored (localStorage + account) or sent in
                    // headers — display names break ISO-8859-1 header values.
                    trackUsage('settings', 'change-language');
                    // setLanguage applies straight away (no refresh) and saves
                    // to the account the moment it is picked.
                    setLanguage(newLanguage);
                    showSaved();
                  }}
                >
                  <SelectTrigger className="w-full bg-muted/30 border border-border rounded-lg p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer h-10">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => (
                      <SelectItem key={l.code} value={l.code}>{l.native}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={resetDefaults}
                  data-testid="button-reset-defaults-appearance"
                  className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset All to Defaults
                </button>
                <button
                  onClick={() => {
                    trackUsage('settings', 'redo-tutorial');
                    window.dispatchEvent(new CustomEvent('tutorial:open'));
                  }}
                  data-testid="button-redo-tutorial"
                  className="px-4 py-2 text-sm text-foreground border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <PlayCircle className="w-4 h-4" />
                  Redo Tutorial
                </button>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-foreground">Notification Preferences</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Control your device alerts, momentum coaching, emails and weekly recaps.</p>
              </div>

              {/* 1. Normal Alerts (Free) */}
              <div className="p-4 bg-card border border-border rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground font-semibold">Normal Alerts</p>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Free</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      In-app and standard alerts for overdue tasks, project invitations, and upcoming deadlines.
                    </p>
                  </div>
                  <button
                    onClick={handleNormalAlertsToggle}
                    aria-label="Toggle normal alerts"
                    className={`w-11 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 ${normalAlerts ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 absolute top-0.5 ${normalAlerts ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* 2. Smart Alerts (Premium) */}
              <div className={`p-4 bg-card border border-border rounded-xl ${!isPaid ? 'opacity-80' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground font-semibold flex items-center gap-1.5">
                        Smart Alerts
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                      </p>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Premium</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Proactive AI momentum coaching (e.g., "Falling behind on 3 tasks, maybe prioritize these first") and scheduled energy checks delivered directly to your device.
                    </p>
                  </div>
                  <button
                    onClick={handleSmartAlertsToggle}
                    disabled={savingSmart}
                    aria-label="Toggle smart alerts"
                    className={`w-11 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 ${smartAlerts && isPaid ? 'bg-primary' : 'bg-muted'} disabled:opacity-60`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 absolute top-0.5 ${smartAlerts && isPaid ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {isPaid && smartAlerts && (
                  <div className="mt-3 pt-3 border-t border-border text-xs" data-testid="smart-alerts-device-status">
                    {!notificationsSupported() ? (
                      <span className="text-muted-foreground">Device notifications aren't supported in this browser.</span>
                    ) : notifPermission === 'granted' ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" /> Device notifications are enabled
                        </span>
                        <button
                          onClick={handleSendTestNotification}
                          data-testid="button-test-notification"
                          className="px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors font-medium text-xs"
                        >
                          Send test notification
                        </button>
                      </div>
                    ) : notifPermission === 'denied' ? (
                      <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5" /> Notifications are blocked in your browser. Enable them in your browser settings to receive Smart Alerts.
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Bell className="w-3.5 h-3.5" /> Allow device notifications to receive Smart Alerts on this device.
                        </span>
                        <button
                          onClick={enableDeviceNotifications}
                          disabled={enablingNotif}
                          data-testid="button-enable-device-notifications"
                          className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-xs disabled:opacity-60"
                        >
                          {enablingNotif ? 'Requesting…' : 'Enable on this device'}
                        </button>
                      </div>
                    )}
                    {notifNotice && (
                      <p className="mt-2 text-green-600 dark:text-green-400" role="status">{notifNotice}</p>
                    )}
                  </div>
                )}
                {!isPaid && (
                  <p className="mt-2.5 text-xs text-primary font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Upgrade to Premium to unlock Smart Alerts
                  </p>
                )}
              </div>

              {/* 3. Email Notifications (Premium) */}
              <div className={`p-4 bg-card border border-border rounded-xl ${!isPaid ? 'opacity-80' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground font-semibold flex items-center gap-1.5">
                        Email Notifications
                      </p>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Premium</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Product updates, new feature announcements, and security notices delivered straight to your inbox.
                    </p>
                  </div>
                  <button
                    onClick={handleEmailNotifsToggle}
                    disabled={savingEmail}
                    aria-label="Toggle email notifications"
                    className={`w-11 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 ${emailNotifs && isPaid ? 'bg-primary' : 'bg-muted'} disabled:opacity-60`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 absolute top-0.5 ${emailNotifs && isPaid ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {!isPaid && (
                  <p className="mt-2.5 text-xs text-primary font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Upgrade to Premium to unlock email notifications
                  </p>
                )}
              </div>

              {/* 4. Weekly AI Summary Emails (Pro) */}
              <div className={`p-4 bg-card border border-border rounded-xl ${!isTopTier ? 'opacity-80' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground font-semibold flex items-center gap-1.5">
                        Weekly AI Summary Emails
                        <Brain className="w-3.5 h-3.5 text-purple-500" />
                      </p>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">Pro</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Comprehensive weekly AI productivity recap, bottleneck diagnosis, habit streaks, and goal roadmap delivered every Monday morning.
                    </p>
                  </div>
                  <button
                    onClick={handleWeeklyAiSummaryToggle}
                    aria-label="Toggle weekly AI summary emails"
                    className={`w-11 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 ${weeklyAiSummary && isTopTier ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 absolute top-0.5 ${weeklyAiSummary && isTopTier ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {!isTopTier && (
                  <p className="mt-2.5 text-xs text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Pro Feature — upgrade to unlock weekly AI summaries
                  </p>
                )}
                {user?.isAdmin && isTopTier && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <button
                      onClick={sendSummaryNow}
                      disabled={summarySending}
                      data-testid="button-send-summary-now"
                      className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50 font-medium"
                    >
                      {summarySending ? 'Sending…' : 'Send summary now (admin)'}
                    </button>
                    {summaryMessage && (
                      <p className="mt-2 text-xs text-muted-foreground">{summaryMessage}</p>
                    )}
                  </div>
                )}
              </div>

              {(savingSmart || savingEmail) && (
                <p className="text-xs text-muted-foreground" role="status">Saving…</p>
              )}
              {notifError && (
                <p className="text-xs text-destructive" role="alert">{notifError}</p>
              )}
            </div>
          )}

          {activeSection === 'energy' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-2xl p-6">
                <h2 className="text-lg font-bold text-foreground mb-2">Energy Levels</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Log how you're feeling at three daily checks 8:00am, 12:00pm and 4:00pm.
                  Each answer is saved to your energy history, which MyPlanner uses to build your
                  energy profile: your peak hours, how consistent your energy is day to day, and
                  recommendations for scheduling demanding tasks during your high-energy periods
                  while keeping routine work for low-energy ones.
                </p>
              </div>

              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-muted/50 to-muted/30 px-6 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Energy Tracker
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Log your energy at 8:00am, 12:00pm and 4:00pm. Disabling pauses the checks — they resume at the next due slot.
                  </p>
                </div>
                <div className={`p-5 flex items-center justify-between ${!isPaid && 'opacity-70'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Battery className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Daily Energy Checks</p>
                      <p className="text-xs text-muted-foreground">
                        {isPaid
                          ? energyTrackerEnabled
                            ? 'Pop-ups are enabled log your energy at each check'
                            : 'Pop-ups are paused they resume at the next due slot'
                          : 'Upgrade to log your energy and unlock insights'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!isPaid) {
                        window.location.href = '/pricing';
                        return;
                      }
                      const next = !energyTrackerEnabled;
                      setEnergyTrackerEnabled(next);
                      localStorage.setItem('energyTrackerEnabled', String(next));
                      showSaved();
                    }}
                    className={`w-11 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 ml-3 ${energyTrackerEnabled ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 absolute top-0.5 ${energyTrackerEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {!isPaid && (
                  <p className="px-5 pb-5 -mt-2 text-xs text-primary font-medium flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> Premium Feature — upgrade to enable the Energy Tracker
                  </p>
                )}
              </div>

              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-muted/50 to-muted/30 px-6 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Energy Insights
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">Peak times, consistency and recommendations from your logged energy</p>
                </div>
                <div className="p-5">
                  <EnergyInsightsBody />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'history' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">History</h2>
              <div className="flex gap-1 p-1 bg-muted/40 rounded-xl w-fit">
                <button
                  onClick={() => setHistoryTab('energy')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    historyTab === 'energy' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Energy Tracker
                </button>
                <button
                  onClick={() => setHistoryTab('deepfocus')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    historyTab === 'deepfocus' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Deep Focus
                </button>
              </div>

              {historyTab === 'energy' && (
                <EnergyLog />
              )}

              {historyTab === 'deepfocus' && (
                <div className="space-y-3">
                  {deepFocusLoading ? (
                    <div className="text-sm text-muted-foreground py-4 text-center">Loading sessions...</div>
                  ) : deepFocusSessions.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                        <Brain className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No sessions yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Your completed Deep Focus sessions will appear here.</p>
                    </div>
                  ) : (
                    deepFocusSessions.map((session: any) => {
                      const date = new Date(session.createdAt);
                      const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                      const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={session.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            session.completed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'
                          }`}>
                            {session.completed
                              ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                              : <XCircle className="w-4 h-4 text-muted-foreground" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{session.taskName}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {session.durationMinutes} min
                              </span>
                              <span className={`text-xs font-medium ${session.completed ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                                {session.completed ? 'Completed' : 'Partial'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-muted-foreground">{dateStr}</p>
                            <p className="text-xs text-muted-foreground">{timeStr}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {activeSection === 'shortcuts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h2>
                <div className="flex items-center gap-2">
                  {(() => {
                    const enabledCount = shortcuts.filter(s => s.enabled !== false).length;
                    const allEnabled = enabledCount === shortcuts.length && shortcuts.length > 0;
                    return (
                      <button
                        onClick={() => setAllShortcutsEnabled(!allEnabled)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-border bg-card hover:border-primary/40 transition-all"
                        title={allEnabled ? 'Disable all shortcuts' : 'Enable all shortcuts'}
                      >
                        <span className={`w-8 h-[18px] rounded-full relative transition-all flex-shrink-0 ${allEnabled ? 'bg-primary' : 'bg-muted'}`}>
                          <span className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-all ${allEnabled ? 'left-[16px]' : 'left-[2px]'}`} />
                        </span>
                        {allEnabled ? 'Disable all' : 'Enable all'}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => {
                      if (isShortcutLimitReached) {
                        if (!isTopTier) navigate('/pricing');
                        return;
                      }
                      setNewShortcutTitle(''); setNewShortcutKeys(''); setNewShortcutError(''); setNewShortcutAction(SHORTCUT_ACTIONS[0].id); setNewShortcutSplitLeft(''); setNewShortcutSplitRight(''); setAddShortcutOpen(true);
                    }}
                    disabled={isShortcutLimitReached && isTopTier}
                    title={isShortcutLimitReached ? (isTopTier ? `Custom shortcuts limit reached (${maxCustomShortcuts} max on Pro)` : `Custom shortcuts limit reached (${maxCustomShortcuts} max). Click to upgrade.`) : undefined}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
                      isShortcutLimitReached
                        ? isTopTier
                          ? 'bg-muted text-muted-foreground border border-border opacity-70 cursor-not-allowed'
                          : 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isShortcutLimitReached ? 'Limit reached' : 'Add Shortcut'}</span>
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Click a command badge, then press the new key combination (include Ctrl, Alt, Shift or Meta). Press Esc to cancel.</p>
              {rebindError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2" role="alert">{rebindError}</p>
              )}

              <div className="space-y-2">
                {shortcuts.map(s => {
                  const actionLabel = SHORTCUT_ACTIONS.find(a => a.id === s.action)?.label || s.action;
                  const splitLeftDef = s.splitLeft ? findAppPage(s.splitLeft) : undefined;
                  const splitRightDef = s.splitRight ? findAppPage(s.splitRight) : undefined;
                  const splitSummary =
                    s.action === CREATE_SPLIT_SCREEN_ACTION_ID && splitLeftDef && splitRightDef
                      ? `${t(splitLeftDef.label)} ↔ ${t(splitRightDef.label)}`
                      : '';
                  const isRebinding = rebindingId === s.id;
                  const isDefault = DEFAULT_SHORTCUTS.some(d => d.id === s.id);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-xl">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {actionLabel}{splitSummary ? `: ${splitSummary}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Rebind badge */}
                        <button
                          onClick={() => { setRebindError(''); setRebindingId(isRebinding ? null : s.id); }}
                          className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-all flex-shrink-0 ${isRebinding ? 'border-primary bg-primary/10 text-primary animate-pulse' : 'border-border bg-muted/50 text-foreground hover:border-primary/40'}`}
                          title="Click, then press new keys"
                        >
                          {isRebinding ? 'Press keys…' : s.keys}
                        </button>
                        {/* Enabled/disabled toggle */}
                        <button
                          onClick={() => persistShortcuts(shortcuts.map(x => x.id === s.id ? { ...x, enabled: !(x.enabled !== false) } : x))}
                          aria-pressed={s.enabled !== false}
                          className={`px-2 py-1 rounded-md text-[10px] font-medium flex-shrink-0 ${s.enabled !== false ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'} transition-all`}
                          title={s.enabled !== false ? 'Disable shortcut' : 'Enable shortcut'}
                        >
                          {s.enabled !== false ? <CheckCircle2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                        {/* Delete button — only for user-added shortcuts */}
                        {!isDefault && (
                          <button
                            onClick={() => { const next = shortcuts.filter(x => x.id !== s.id); persistShortcuts(next); }}
                            className="px-2 py-1 text-xs text-destructive hover:text-destructive/90 rounded border bg-destructive/5 hover:bg-destructive/10 transition-all"
                            title="Remove shortcut"
                            aria-label="Remove shortcut"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {addShortcutOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setAddShortcutOpen(false)}>
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
                  <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
                    <h3 className="text-sm font-bold text-foreground">Add Shortcut</h3>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Title</label>
                      <input value={newShortcutTitle} onChange={e => setNewShortcutTitle(e.target.value)} placeholder="e.g. My focus view" className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Command (key combo)</label>
                      <button onClick={() => { setNewShortcutError(''); setCapturingNewKeys(v => !v); }} className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-border bg-muted/40 hover:border-primary/40 transition-all text-left">
                        {capturingNewKeys ? 'Press keys… (Esc to cancel)' : (newShortcutKeys || 'Click to set keys')}
                      </button>
                      {newShortcutError && (
                        <p className="mt-1.5 text-xs text-destructive" role="alert">{newShortcutError}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Action</label>
                      <Select value={newShortcutAction} onValueChange={setNewShortcutAction}>
                        <SelectTrigger className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                          <SelectValue placeholder="Choose action" />
                        </SelectTrigger>
                        <SelectContent>
                          {SHORTCUT_ACTIONS.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {splitActionSelected && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Left page</label>
                          <Select value={newShortcutSplitLeft || undefined} onValueChange={setNewShortcutSplitLeft}>
                            <SelectTrigger className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                              <SelectValue placeholder="Choose page" />
                            </SelectTrigger>
                            <SelectContent>
                              {APP_PAGES.filter(page => page.inSplitPicker && page.path !== newShortcutSplitRight).map(page => (
                                <SelectItem key={page.path} value={page.path}>{t(page.label)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Right page</label>
                          <Select value={newShortcutSplitRight || undefined} onValueChange={setNewShortcutSplitRight}>
                            <SelectTrigger className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                              <SelectValue placeholder="Choose page" />
                            </SelectTrigger>
                            <SelectContent>
                              {APP_PAGES.filter(page => page.inSplitPicker && page.path !== newShortcutSplitLeft).map(page => (
                                <SelectItem key={page.path} value={page.path}>{t(page.label)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="col-span-2 text-[11px] text-muted-foreground">
                          The saved shortcut opens these two pages side by side.
                        </p>
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => setAddShortcutOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Cancel</button>
                      <button
                        onClick={() => {
                          if (isShortcutLimitReached) {
                            if (!isTopTier) navigate('/pricing');
                            return;
                          }
                          if (!newShortcutTitle.trim() || !newShortcutKeys.trim()) return;
                          if (!splitPagesReady) {
                            setNewShortcutError('Choose a different page for each half.');
                            return;
                          }
                          const clash = findShortcutWithKeys(newShortcutKeys.trim());
                          if (clash) {
                            setNewShortcutError(`That keybind is already in use in shortcut "${clash.title}".`);
                            return;
                          }
                          trackUsage('settings', 'add-shortcut');
                          const entry: ShortcutDef = {
                            id: `sc-${Date.now().toString(36)}`,
                            title: newShortcutTitle.trim(),
                            keys: normalizeCombo(newShortcutKeys.trim()) || newShortcutKeys.trim(),
                            action: newShortcutAction,
                            enabled: true,
                            ...(splitActionSelected
                              ? { splitLeft: newShortcutSplitLeft, splitRight: newShortcutSplitRight }
                              : {}),
                          };
                          persistShortcuts([...shortcuts, entry]);
                          setAddShortcutOpen(false);
                          setNewShortcutError('');
                          setNewShortcutSplitLeft('');
                          setNewShortcutSplitRight('');
                        }}
                        disabled={(isShortcutLimitReached && isTopTier) || (!isShortcutLimitReached && (!newShortcutTitle.trim() || !newShortcutKeys.trim() || !splitPagesReady))}
                        className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${
                          isShortcutLimitReached
                            ? 'bg-amber-500/15 border border-amber-500/30 text-amber-500 hover:bg-amber-500/25'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
                        }`}
                      >
                        {isShortcutLimitReached ? 'Limit reached' : 'Save Shortcut'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === 'account' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-4">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} loading="lazy" decoding="async" className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
                      {initials}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase mt-1 inline-block">
                      {user?.subscriptionTier === 'free' ? 'Free Plan' : user?.subscriptionTier === 'pro' ? 'Pro Plan' : user?.subscriptionTier === 'premium' ? 'Premium Plan' : 'Free Plan'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={resetDefaults}
                  data-testid="button-reset-defaults"
                  className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset All Defaults
                </button>
                <button
                  onClick={logout}
                  data-testid="button-sign-out"
                  className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
                <button
                  onClick={() => { setDeleteStep(1); setDeleteError(''); setDeleteDialogOpen(true); }}
                  data-testid="button-delete-account"
                  className="px-4 py-2 text-sm text-white bg-destructive border border-destructive rounded-lg hover:bg-destructive/90 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </button>
              </div>
              {deleteDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteDialogOpen(false)} />
                  <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                    <h3 className="text-base font-bold text-foreground mb-2">{deleteStep === 1 ? 'Delete your account?' : 'Are you absolutely sure?'}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{deleteStep === 1 ? 'This will permanently delete all your tasks, notes, projects and settings. This cannot be undone.' : 'This is permanent and cannot be recovered. All your data will be erased.'}</p>
                    {deleteError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"><p className="text-sm text-destructive">{deleteError}</p></div>}
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setDeleteDialogOpen(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
                      {deleteStep === 1 ? (
                        <button onClick={() => setDeleteStep(2)} className="px-4 py-2 text-sm bg-destructive text-white rounded-lg hover:bg-destructive/90">Delete</button>
                      ) : (
                        <button
                          disabled={deleteLoading}
                          onClick={async () => {
                            setDeleteLoading(true);
                            try {
                              const res = await fetch('/api/auth/account', { method: 'DELETE', credentials: 'include' });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data.error || 'Failed to delete');
                              localStorage.clear();
                              window.location.href = '/login';
                            } catch (e: any) {
                              setDeleteLoading(false);
                              console.error(e);
                            }
                          }}
                          className="px-4 py-2 text-sm bg-destructive text-white rounded-lg hover:bg-destructive/90 disabled:opacity-50"
                        >
                          {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === 'tickets' && ((ticketsLoaded && userTickets.length > 0) ? (() => {
            const TICKET_CATEGORIES = ['all', 'support', 'bug', 'suggestion', 'report'];
            const typeColor = (type: string) =>
              type === 'suggestion' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
              type === 'bug' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
              type === 'report' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';

            const applyFilters = (list: TicketData[]) =>
              list
                .filter(t => ticketCategory === 'all' || t.type === ticketCategory)
                .filter(t => !ticketSearch || t.subject.toLowerCase().includes(ticketSearch.toLowerCase()));

            const openTickets = applyFilters(userTickets.filter(t => t.status === 'open'));
            const resolvedTickets = applyFilters(userTickets.filter(t => t.status === 'closed'));
            const displayList = ticketTab === 'open' ? openTickets : resolvedTickets;

            return (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Your Tickets</h2>
                <DiscordCommunitySection className="mb-4" />

                {/* Tab switcher */}
                <div className="flex gap-2">
                  {(['open', 'resolved'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setTicketTab(tab)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        ticketTab === tab
                          ? 'bg-foreground text-background'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab === 'open' ? 'Open' : 'Resolved'}
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        ticketTab === tab ? 'bg-background/20' : 'bg-border'
                      }`}>
                        {tab === 'open'
                          ? userTickets.filter(t => t.status === 'open').length
                          : userTickets.filter(t => t.status === 'closed').length}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Search + Category filter */}
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2">
                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <input
                      type="text"
                      value={ticketSearch}
                      onChange={e => setTicketSearch(e.target.value)}
                      placeholder="Search tickets"
                      aria-label="Search tickets"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    {ticketSearch && (
                      <button onClick={() => setTicketSearch('')} aria-label="Clear search" title="Clear search" className="text-muted-foreground hover:text-foreground">
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <Select value={ticketCategory} onValueChange={setTicketCategory}>
                    <SelectTrigger className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none cursor-pointer capitalize h-9">
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_CATEGORIES.map(c => (
                        <SelectItem key={c} value={c} className="capitalize">{c === 'all' ? 'All categories' : c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Ticket list */}
                {userTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tickets yet.</p>
                ) : displayList.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No {ticketTab} tickets match your filters.</p>
                ) : (
                  <div className="space-y-2">
                    {displayList.map(ticket => (
                      <button
                        key={ticket.id}
                        onClick={() => setActivePanelTicket(ticket)}
                        className={`w-full flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors text-left ${ticketTab === 'resolved' ? 'opacity-75' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${typeColor(ticket.type)}`}>
                            {ticket.type}
                          </span>
                          <span className="text-sm font-medium truncate">{ticket.subject}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className="text-xs text-muted-foreground">{ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString(dateLocale()) : ''}</span>
                          {ticketTab === 'open' ? (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Open</span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Resolved</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-6 pt-6 border-t border-border">
                  <SupportContent showWhatsNew={false} />
                </div>
              </div>
            );
           })() : !ticketsLoaded ? (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Your Tickets</h2>
              <div className="flex justify-center py-8"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Your Tickets</h2>
              <p className="text-xs text-muted-foreground">
                You don't have any tickets yet. Need help? Explore the support hub below.
              </p>
              <div className="flex gap-2 mb-2">
                <button onClick={fetchUserTickets} className="text-xs text-primary hover:underline">Refresh</button>
              </div>
              <SupportContent showWhatsNew={false} />
            </div>
          ))}

          {activeSection === 'security' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Privacy & Security</h2>
              <div className="p-4 bg-card border border-border rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Two-factor authentication (email)</p>
                  <p className="text-xs text-muted-foreground">Get a 6-digit code by email on every login</p>
                </div>
                <button
                  aria-label="Toggle two-factor email authentication"
                  disabled={disable2faSending}
                  onClick={async () => {
                    if (twoFactorEnabled) {
                      // Disabling requires email verification code
                      setDisable2faError('');
                      setDisable2faCode('');
                      setDisable2faSending(true);
                      setDisable2faModalOpen(true);
                      try {
                        const res = await fetch('/api/auth/two-factor/send-disable-code', {
                          method: 'POST',
                          credentials: 'include',
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setDisable2faError(data.error || 'Failed to send verification code');
                        }
                      } catch {
                        setDisable2faError('Failed to send verification code');
                      } finally {
                        setDisable2faSending(false);
                      }
                      return;
                    }

                    // Enabling 2FA
                    const prev = twoFactorEnabled;
                    setTwoFactorEnabled(true);
                    try {
                      const res = await fetch('/api/auth/two-factor/enable', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ enabled: true }),
                      });
                      if (!res.ok) throw new Error('Failed');
                      showSaved();
                    } catch {
                      setTwoFactorEnabled(prev);
                    }
                  }}
                  className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${twoFactorEnabled ? 'bg-primary' : 'bg-muted'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${twoFactorEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {twoFactorEnabled && <p className="text-xs text-muted-foreground">A code will be emailed to you on next login. Check your inbox (and spam) for the 6-digit code.</p>}
              <div className="space-y-3">
                {[
                  { label: 'Passwords hashed with bcrypt (cost 12)', desc: 'Your password is never stored in plain text' },
                  { label: 'Session via httpOnly cookies', desc: 'JWT tokens are invisible to JavaScript — XSS protected' },
                  { label: 'Google OAuth verified server-side', desc: 'Google sign-in tokens are verified server-side only' },
                  { label: 'Input validation on every route', desc: 'All inputs are validated and sanitized with Zod' },
                  { label: '10kb request body limit', desc: 'Prevents large payload denial-of-service attacks' },
                  { label: 'Per-user data isolation', desc: 'Your tasks and notes are private and bound to your account' },
                  { label: 'OAuth tokens encrypted in database', desc: 'Google Calendar tokens are stored securely in PostgreSQL' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-card border border-border rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                      <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'organization' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-foreground">Organization Memberships</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Organizations grant plan access to members. Your personal tasks, notes, habits and chats are never shared.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setJoinCodeInput('');
                    setJoinError('');
                    setJoinSuccess('');
                    setJoinModalOpen(true);
                  }}
                  data-testid="button-join-organization"
                  className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-all shadow-xs flex-shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Join Organization
                </button>
              </div>

              {/* Effective Plan / Pause / Reserve / 30-day Archive Status Banner (Rules 8-11) */}
              {(user?.planSource === 'org' || user?.personalPlanPaused || user?.reservedOrgTier || (user?.archivedAttachmentCount || 0) > 0) && (
                <div className="p-4 rounded-xl border border-primary/25 bg-primary/5 space-y-1.5 text-xs">
                  {user?.planSource === 'org' && (
                    <p className="font-semibold text-foreground">
                      Active Plan: <span className="uppercase text-primary font-bold">{user.subscriptionTier}</span> via organization{user.bestOrgName ? ` (${user.bestOrgName})` : ''}.
                    </p>
                  )}
                  {user?.personalPlanPaused && user?.pausedPersonalTier && (
                    <p className="text-muted-foreground">
                      Your personal <span className="uppercase font-semibold text-foreground">{user.pausedPersonalTier}</span> plan is paused while you have an equal or higher organization plan, and will resume automatically with its remaining time if you leave.
                    </p>
                  )}
                  {user?.reservedOrgTier && user?.planSource !== 'org' && (
                    <p className="text-muted-foreground">
                      Your personal <span className="uppercase font-semibold text-foreground">{user.subscriptionTier}</span> plan remains active. Your <span className="uppercase font-semibold text-foreground">{user.reservedOrgTier}</span> organization plan is held in reserve and will take over automatically if your personal plan ends.
                    </p>
                  )}
                  {(user?.archivedAttachmentCount || 0) > 0 && (
                    <p className="text-amber-600 dark:text-amber-400 font-medium">
                      {user?.archivedAttachmentCount} Premium file(s)/image(s) are currently archived and locked. Regain a Premium/Pro plan or join an organization{user?.oldestArchiveExpiresAt ? ` before ${new Date(user.oldestArchiveExpiresAt).toLocaleDateString()}` : ' within 30 days'} to restore them automatically.
                    </p>
                  )}
                </div>
              )}

              {orgsLoading ? (
                <div className="flex justify-center py-12">
                  <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (() => {
                const byId = new Map<number, any>();
                for (const o of joinedOrgs) byId.set(o.id, o);
                for (const o of ownedOrgs) byId.set(o.id, { ...(byId.get(o.id) || {}), ...o });
                const unifiedOrgs = Array.from(byId.values());

                if (unifiedOrgs.length === 0) {
                  return (
                    <div className="p-8 text-center bg-card border border-border rounded-2xl">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">Not in any organization</h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
                        Have an invite code from a school or family plan? Click Join Organization above to enter your code and unlock their plan.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {unifiedOrgs.map((org: any) => {
                      const canManage = Boolean(org.isOwner || org.isAdmin);
                      return (
                        <div key={org.id} className="p-4 bg-card border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold ${
                              canManage ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-primary/10 text-primary'
                            }`}>
                              <Building2 className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-bold text-foreground truncate">{org.name}</p>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                  {org.tier}
                                </span>
                                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                  {org.type}
                                </span>
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                                  org.isOwner
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                    : org.isAdmin
                                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                                    : 'bg-muted text-muted-foreground border-border'
                                }`}>
                                  {org.isOwner ? 'Owner' : org.isAdmin ? 'Admin' : 'Member'}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {org.currentSeats != null && org.maxSeats != null ? `${org.currentSeats}/${org.maxSeats} seats · ` : ''}
                                {org.joinedAt ? `Joined ${new Date(org.joinedAt).toLocaleDateString()}` : 'Active'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {canManage && (
                              <button
                                onClick={() => navigate(`/organizations?id=${org.id}`)}
                                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                              >
                                Manage
                              </button>
                            )}
                            {!org.isOwner && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Are you sure you want to leave ${org.name}? Your plan will automatically adjust to your best remaining source.`)) return;
                                  try {
                                    const res = await fetch(`/api/organizations/${org.id}/leave`, {
                                      method: 'POST',
                                      credentials: 'include',
                                    });
                                    if (res.ok) {
                                      await fetchOrganizations();
                                      await refreshUser();
                                      window.dispatchEvent(new Event('orgs-refresh'));
                                      showSaved();
                                    } else {
                                      const data = await res.json();
                                      alert(data.error || 'Failed to leave organization');
                                    }
                                  } catch {
                                    alert('Failed to leave organization');
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/10 transition-colors"
                              >
                                Leave
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {activeSection === 'integrations' && (
            <IntegrationsSection />
          )}

          {/* 2FA Disable Verification Modal */}
          {disable2faModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
              <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">Disable Two-Factor Authentication</h3>
                      <p className="text-xs text-muted-foreground">Verify your identity to proceed</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setDisable2faModalOpen(false);
                      setDisable2faError('');
                    }}
                    className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  A 6-digit verification code has been sent to <span className="font-semibold text-foreground">{user?.email}</span>. Enter the code below to disable two-factor authentication.
                </p>

                <div>
                  <input
                    type="text"
                    maxLength={6}
                    value={disable2faCode}
                    onChange={e => setDisable2faCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 px-4 rounded-xl border border-border bg-background focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                  {disable2faError && (
                    <p className="text-xs text-destructive mt-1.5 font-medium">{disable2faError}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setDisable2faError('');
                      try {
                        const res = await fetch('/api/auth/two-factor/send-disable-code', {
                          method: 'POST',
                          credentials: 'include',
                        });
                        const data = await res.json();
                        if (res.ok) {
                          alert('New code sent to your email.');
                        } else {
                          setDisable2faError(data.error || 'Failed to resend code');
                        }
                      } catch {
                        setDisable2faError('Failed to resend code');
                      }
                    }}
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    Resend code
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDisable2faModalOpen(false)}
                      className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={disable2faLoading || disable2faCode.length !== 6}
                      onClick={async () => {
                        setDisable2faLoading(true);
                        setDisable2faError('');
                        try {
                          const res = await fetch('/api/auth/two-factor/disable', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ code: disable2faCode.trim() }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            setTwoFactorEnabled(false);
                            setDisable2faModalOpen(false);
                            showSaved();
                          } else {
                            setDisable2faError(data.error || 'Verification failed');
                          }
                        } catch {
                          setDisable2faError('Network error verifying code');
                        } finally {
                          setDisable2faLoading(false);
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold hover:bg-destructive/90 transition-all disabled:opacity-50"
                    >
                      {disable2faLoading ? 'Verifying…' : 'Disable 2FA'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Join Organization Modal */}
          {joinModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
              <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">Join an Organization</h3>
                      <p className="text-xs text-muted-foreground">Enter an organization or group join code</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setJoinModalOpen(false);
                      setJoinError('');
                      setJoinSuccess('');
                    }}
                    className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter the 6-character code provided by your organization owner or group administrator. You'll instantly receive their plan access.
                </p>

                <div>
                  <input
                    type="text"
                    maxLength={8}
                    value={joinCodeInput}
                    onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="w-full text-center tracking-[0.3em] uppercase text-2xl font-mono py-3 px-4 rounded-xl border border-border bg-background focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                  {joinError && (
                    <p className="text-xs text-destructive mt-1.5 font-medium">{joinError}</p>
                  )}
                  {joinSuccess && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 font-medium">{joinSuccess}</p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setJoinModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={joinLoading || joinCodeInput.trim().length < 3}
                    onClick={async () => {
                      setJoinLoading(true);
                      setJoinError('');
                      setJoinSuccess('');
                      try {
                        const res = await fetch('/api/organizations/join', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ code: joinCodeInput.trim() }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setJoinSuccess(data.message || 'Joined successfully!');
                          await fetchOrganizations();
                          await refreshUser();
                          window.dispatchEvent(new Event('orgs-refresh'));
                          showSaved();
                          setTimeout(() => {
                            setJoinModalOpen(false);
                          }, 800);
                        } else {
                          setJoinError(data.error || 'Failed to join organization');
                        }
                      } catch {
                        setJoinError('Network error joining organization');
                      } finally {
                        setJoinLoading(false);
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    {joinLoading ? 'Joining…' : 'Join'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
      {activePanelTicket && (
        <TicketConversation
          ticket={activePanelTicket}
          messages={panelMessages}
          viewAs="user"
          currentUserName={user?.name || 'You'}
          onClose={() => { setActivePanelTicket(null); setPanelMessages([]); fetchUserTickets(); }}
          onSendMessage={handleSendTicketMessage}
          sending={sendingMessage}
        />
      )}
    </div>
  );
};

export default SettingsPage;
