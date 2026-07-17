import React, { useState, useEffect } from 'react';
import {
  Palette, Bell, Globe, Calendar, Battery,
  Moon, Sun, Monitor, LogOut, User, Shield, CheckCircle,
  Link2, Link2Off, RefreshCw, ExternalLink, Sparkles, Zap,
  History, Brain, CheckCircle2, XCircle, Clock, MessageSquare, Dot
} from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useBoardContext } from '@/context/BoardContext';
import { useLanguage } from '@/context/LanguageContext'; // Import the language hook
import EnergyAnalytics from '@/components/EnergyAnalytics';
import TicketConversation, { TicketData, TicketMessage } from '@/components/TicketConversation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

const FONTS = ['Inter', 'Nunito', 'Outfit', 'Roboto'];

const LANGUAGES = [
  'English', 'Español', 'Français', 'Deutsch', 'Português',
  'العربية', 'עברית', '中文', 'हिन्दी', 'Русский', '日本語', '한국어',
];

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
  { hex: '#111827', hsl: '220 39% 11%', label: 'Dark Gray' },
  { hex: '#2563EB', hsl: '220 89% 56%', label: 'Blue' },
  { hex: '#7C3AED', hsl: '263 70% 50%', label: 'Purple' },
  { hex: '#059669', hsl: '161 94% 30%', label: 'Green' },
  { hex: '#D97706', hsl: '38 92% 50%', label: 'Amber' },
  { hex: '#DC2626', hsl: '0 72% 51%', label: 'Red' },
  { hex: '#DB2777', hsl: '330 81% 51%', label: 'Pink' },
];

const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { board, addTask } = useBoardContext();
  const { language, setLanguage } = useLanguage(); // Use language context
  const [activeSection, setActiveSection] = useState('appearance');
  const [selectedTheme, setSelectedTheme] = useState(theme);
  const [font, setFont] = useState(() => localStorage.getItem('font') || 'Inter');
  // Remove local language state since we're using context
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('accentColor') || '#111827');
  const [smartAlerts, setSmartAlerts] = useState(() => localStorage.getItem('smartAlerts') !== 'false');
  const [emailNotifs, setEmailNotifs] = useState(() => localStorage.getItem('emailNotifs') !== 'false');
  const [energyMorning, setEnergyMorning] = useState(() => localStorage.getItem('energyMorning') || 'medium');
  const [energyAfternoon, setEnergyAfternoon] = useState(() => localStorage.getItem('energyAfternoon') || 'high');
  const [energyEvening, setEnergyEvening] = useState(() => localStorage.getItem('energyEvening') || 'low');
  const [saved, setSaved] = useState(false);

  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarConfigured, setCalendarConfigured] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ synced: number; total: number } | null>(null);
  const [syncError, setSyncError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');
  const [historyTab, setHistoryTab] = useState<'energy' | 'deepfocus'>('deepfocus');
  const [deepFocusSessions, setDeepFocusSessions] = useState<any[]>([]);
  const [deepFocusLoading, setDeepFocusLoading] = useState(false);
  const isPaid = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isTopTier = user?.subscriptionTier === 'premium';
  const isMidTier = user?.subscriptionTier === 'pro';

  const [userTickets, setUserTickets] = useState<TicketData[]>([]);
  const [hasTickets, setHasTickets] = useState(false);
  const [activePanelTicket, setActivePanelTicket] = useState<TicketData | null>(null);
  const [panelMessages, setPanelMessages] = useState<TicketMessage[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [ticketTab, setTicketTab] = useState<'open' | 'resolved'>('open');
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketCategory, setTicketCategory] = useState('all');

  const sections = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'energy', label: 'Energy Levels', icon: Battery },
    { id: 'history', label: 'History', icon: History },
    { id: 'account', label: 'Account', icon: User },
    { id: 'security', label: 'Privacy', icon: Shield },
    ...(hasTickets ? [{ id: 'tickets', label: 'Tickets', icon: MessageSquare }] : []),
  ];

  const fetchUserTickets = async () => {
    try {
      const res = await fetch('/api/support/tickets/my', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUserTickets(data);
        // Only ever transition false → true, never hide the nav item once visible
        if (data.length > 0) setHasTickets(true);
      }
    } catch {}
  };

  useEffect(() => {
    fetchSettings();
    fetchUserTickets();
  }, []);

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

  const handleSendTicketMessage = async (text: string) => {
    if (!activePanelTicket) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`/api/support/tickets/${activePanelTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data = await fetch(`/api/support/tickets/${activePanelTicket.id}/messages`, { credentials: 'include' });
        if (data.ok) {
          const msgs = await data.json();
          setPanelMessages(msgs.messages || []);
          setActivePanelTicket(prev => prev ? { ...prev, ...msgs.ticket } : null);
        }
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
          document.body.style.fontFamily = `'${data.fontFamily}', system-ui, -apple-system, sans-serif`;
        }
        if (data.accentColor && data.accentHsl) {
          setAccentColor(data.accentColor);
          document.documentElement.style.setProperty('--primary', data.accentHsl);
          document.documentElement.style.setProperty('--ring', data.accentHsl);
        }
        if (data.language) setLanguage(data.language);
        setSmartAlerts(data.smartAlerts !== false);
        setEmailNotifs(data.emailNotifs !== false);
        if (data.energyMorning) setEnergyMorning(data.energyMorning);
        if (data.energyAfternoon) setEnergyAfternoon(data.energyAfternoon);
        if (data.energyEvening) setEnergyEvening(data.energyEvening);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  useEffect(() => {
    const savedFont = localStorage.getItem('font');
    const savedHsl = localStorage.getItem('accentHsl');
    if (savedFont) document.body.style.fontFamily = `'${savedFont}', system-ui, -apple-system, sans-serif`;
    if (savedHsl) {
      document.documentElement.style.setProperty('--primary', savedHsl);
      document.documentElement.style.setProperty('--ring', savedHsl);
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'calendar') fetchCalendarStatus();
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendarConnected') === 'true') {
      setActiveSection('calendar');
      fetchCalendarStatus();
      window.history.replaceState({}, '', '/settings');
    }
    if (params.get('calendarError')) {
      setSyncError(`Connection error: ${params.get('calendarError')}`);
      setActiveSection('calendar');
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  const fetchCalendarStatus = async () => {
    try {
      const res = await fetch('/api/calendar/status', { credentials: 'include' });
      const data = await res.json();
      setCalendarConnected(data.connected);
      setCalendarConfigured(data.configured);
    } catch {}
  };

  const connectCalendar = async () => {
    setCalendarLoading(true);
    setSyncError('');
    try {
      const res = await fetch('/api/calendar/auth', { credentials: 'include' });
      const data = await res.json();
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
    document.body.style.fontFamily = `'${f}', system-ui, -apple-system, sans-serif`;
    setFont(f);
    localStorage.setItem('font', f);
    
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
    document.documentElement.style.setProperty('--primary', hsl);
    document.documentElement.style.setProperty('--ring', hsl);
    document.documentElement.style.setProperty('--sidebar-primary', hsl);
    document.documentElement.style.setProperty('--sidebar-ring', hsl);
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

  const saveEnergyLevels = async () => {
    localStorage.setItem('energyMorning', energyMorning);
    localStorage.setItem('energyAfternoon', energyAfternoon);
    localStorage.setItem('energyEvening', energyEvening);
    
    // Save to backend for all users (settings table exists for everyone)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          energyMorning,
          energyAfternoon,
          energyEvening,
        }),
      });
      showSaved();
    } catch (error) {
      console.error('Error saving energy levels:', error);
      // Still show saved since localStorage was updated
      showSaved();
    }
  };

  const saveNotificationSettings = async () => {
    localStorage.setItem('smartAlerts', String(smartAlerts));
    localStorage.setItem('emailNotifs', String(emailNotifs));
    
    // Save to backend
    if (isPaid) {
      try {
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            smartAlerts,
            emailNotifs,
          }),
        });
        showSaved();
      } catch (error) {
        console.error('Error saving notifications:', error);
      }
    }
  };

  const resetDefaults = async () => {
    // Reset local state
    setSmartAlerts(true);
    setEmailNotifs(true);
    setEnergyMorning('medium');
    setEnergyAfternoon('high');
    setEnergyEvening('low');
    setLanguage('English');
    setFont('Inter');
    setAccentColor('#111827');
    setSelectedTheme('light');
    
    // Clear all settings from localStorage except essential auth data
    const authData = {
      token: localStorage.getItem('token'),
      session: localStorage.getItem('session'),
    };
    
    localStorage.clear();
    
    // Restore essential auth data
    if (authData.token) localStorage.setItem('token', authData.token);
    if (authData.session) localStorage.setItem('session', authData.session);
    
    // Apply default settings to localStorage
    localStorage.setItem('smartAlerts', 'true');
    localStorage.setItem('emailNotifs', 'true');
    localStorage.setItem('energyMorning', 'medium');
    localStorage.setItem('energyAfternoon', 'high');
    localStorage.setItem('energyEvening', 'low');
    localStorage.setItem('language', 'English');
    localStorage.setItem('font', 'Inter');
    localStorage.setItem('accentColor', '#111827');
    localStorage.setItem('accentHsl', '220 39% 11%');
    
    // Apply the settings to the DOM
    document.body.style.fontFamily = `'Inter', system-ui, -apple-system, sans-serif`;
    document.documentElement.style.setProperty('--primary', '220 39% 11%');
    document.documentElement.style.setProperty('--ring', '220 39% 11%');
    document.documentElement.style.setProperty('--sidebar-primary', '220 39% 11%');
    document.documentElement.style.setProperty('--sidebar-ring', '220 39% 11%');
    
    // Reset backend settings too
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          theme: 'system',
          fontFamily: 'Inter',
          accentColor: '#111827',
          accentHsl: '220 39% 11%',
          language: 'English',
          smartAlerts: true,
          emailNotifs: true,
          energyMorning: 'medium',
          energyAfternoon: 'high',
          energyEvening: 'low',
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

  const EnergySelector = ({ value, onChange, label, time }: { value: string; onChange: (v: string) => void; label: string; time: string }) => (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{time}</p>
      </div>
      <div className="flex items-center gap-2 bg-muted/30 rounded-xl p-1">
        {(['low', 'medium', 'high'] as const).map((level, index) => {
          const isSelected = value === level;
          const levelConfig = {
            low: { 
              icon: <Battery className="w-5 h-5" />, 
              color: isSelected ? 'bg-blue-500' : 'bg-blue-100', 
              textColor: isSelected ? 'text-white' : 'text-blue-700',
              borderColor: isSelected ? 'border-blue-500' : 'border-transparent',
              label: 'Low Energy'
            },
            medium: { 
              icon: <><Battery className="w-4 h-4" /><Battery className="w-4 h-4 -ml-1" /></>, 
              color: isSelected ? 'bg-amber-500' : 'bg-amber-100', 
              textColor: isSelected ? 'text-white' : 'text-amber-700',
              borderColor: isSelected ? 'border-amber-500' : 'border-transparent',
              label: 'Medium Energy'
            },
            high: { 
              icon: <><Battery className="w-3 h-3" /><Battery className="w-3 h-3 -ml-1" /><Battery className="w-3 h-3 -ml-1" /></>, 
              color: isSelected ? 'bg-green-500' : 'bg-green-100', 
              textColor: isSelected ? 'text-white' : 'text-green-700',
              borderColor: isSelected ? 'border-green-500' : 'border-transparent',
              label: 'High Energy'
            },
          };
          
          const config = levelConfig[level];
          
          return (
            <button
              key={level}
              onClick={() => onChange(level)}
              data-testid={`button-energy-${label.toLowerCase()}-${level}`}
              className={`
                relative flex flex-col items-center justify-center px-4 py-3 rounded-lg transition-all duration-200 font-medium
                ${isSelected 
                  ? `${config.color} ${config.textColor} shadow-lg scale-105 border-2 ${config.borderColor}` 
                  : `${config.color} ${config.textColor} hover:scale-105 border-2 border-transparent`
                }
              `}
              title={config.label}
            >
              <div className="text-lg mb-1">{config.icon}</div>
              <div className="text-xs font-bold uppercase tracking-wide">{level}</div>
              {isSelected && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const tasksWithDates = board.tasks.filter(t => t.dueDate).length;

  return (
    <div className="flex-1 overflow-y-auto relative">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-base font-bold text-foreground">Settings</h1>
        {saved && (
          <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 animate-fade-in">
            <CheckCircle className="w-3.5 h-3.5" /> Saved
          </div>
        )}
      </header>

      <div className="flex">
        <div className="w-48 border-r border-border p-4 space-y-0.5 flex-shrink-0 min-h-full">
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

        <div className="flex-1 p-6 max-w-2xl">
          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Theme</h2>
                <div className="flex gap-3">
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
                  <div className={`relative w-10 h-10 rounded-full overflow-hidden border-2 border-border flex-shrink-0 transition-transform shadow-sm ${isPaid ? 'cursor-pointer hover:scale-105' : 'opacity-50 cursor-not-allowed'}`} title={isPaid ? "Custom Color Picker" : "Paid Feature"}>
                    <input 
                      type="color" 
                      disabled={!isPaid}
                      value={accentColor}
                      onChange={(e) => {
                        const hex = e.target.value;
                        applyAccentColor(hex, hexToHsl(hex));
                      }}
                      className="absolute inset-[-20px] w-20 h-20 cursor-pointer p-0 border-0 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="h-6 w-px bg-border mx-1"></div>
                  {ACCENT_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => isPaid ? applyAccentColor(c.hex, c.hsl) : window.location.href = '/pricing'}
                      title={c.label}
                      className={`w-8 h-8 rounded-full transition-all duration-200 ${
                        accentColor.toUpperCase() === c.hex.toUpperCase() ? 'ring-2 ring-offset-2 ring-offset-background scale-110 ring-foreground/30' : 'hover:scale-110'
                      } ${!isPaid && 'opacity-50 cursor-not-allowed'}`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
                {!isPaid && (
                  <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-xs text-primary font-medium flex items-center gap-2">
                      <Sparkles className="w-3 h-3" /> Paid Feature: Customize your workspace with any accent color.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">Click the color wheel to choose any custom color. Default is Dark Gray.</p>
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
                  value={language}
                  onValueChange={async (newLanguage) => {
                    setLanguage(newLanguage);
                    localStorage.setItem('language', newLanguage);
                    try {
                      await fetch('/api/settings', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ language: newLanguage }),
                      });
                      showSaved();
                    } catch (error) {
                      console.error('Error saving language:', error);
                    }
                  }}
                >
                  <SelectTrigger className="w-full bg-muted/30 border border-border rounded-lg p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer h-10">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="pt-4">
                <button
                  onClick={resetDefaults}
                  data-testid="button-reset-defaults-appearance"
                  className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset All to Defaults
                </button>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Notification Preferences</h2>
              {[
                { key: 'smartAlerts', label: 'Smart Alerts', desc: 'Task reminders and deadline nudges', value: smartAlerts, set: setSmartAlerts, paid: true },
                { key: 'emailNotifs', label: 'Email Notifications', desc: 'Receive weekly productivity summaries', value: emailNotifs, set: setEmailNotifs, paid: true },
              ].map(item => (
                <div key={item.key} className={`flex items-center justify-between p-4 bg-card border border-border rounded-xl ${item.paid && !isPaid && 'opacity-70'}`}>
                  <div>
                    <p className="text-sm text-foreground font-medium flex items-center gap-2">
                       {item.label}
                       {item.paid && !isPaid && <Sparkles className="w-3 h-3 text-primary" />}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (item.paid && !isPaid) {
                        window.location.href = '/pricing';
                        return;
                      }
                      item.set(!item.value);
                    }}
                    className={`w-11 h-6 rounded-full transition-all duration-200 relative ${item.value ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 absolute top-0.5 ${item.value ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
              <button onClick={saveNotificationSettings} data-testid="button-save-notifications" className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                Save Preferences
              </button>
            </div>
          )}

          {activeSection === 'calendar' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-1">Google Calendar Sync</h2>
                <p className="text-xs text-muted-foreground">Sync your tasks with Google Calendar for seamless scheduling.</p>
              </div>

              {syncError && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl px-4 py-3">
                  {syncError}
                </div>
              )}

              {syncStatus && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  Synced {syncStatus.synced} of {syncStatus.total} tasks to Google Calendar
                </div>
              )}

              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${calendarConnected ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                    {calendarConnected
                      ? <Link2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      : <SiGoogle className="w-5 h-5 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {calendarConnected ? 'Google Calendar Connected' : 'Not connected'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {calendarConnected
                        ? `${tasksWithDates} task${tasksWithDates !== 1 ? 's' : ''} with due dates ready to sync`
                        : 'Link your Google Calendar to sync events and tasks'}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${calendarConnected ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                    {calendarConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {!isPaid ? (
                    <button
                      onClick={() => window.location.href = '/pricing'}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-primary/10 border border-primary/20 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                      Upgrade to Link Google Calendar
                    </button>
                  ) : !calendarConnected ? (
                    <button
                      onClick={connectCalendar}
                      disabled={calendarLoading || !calendarConfigured}
                      data-testid="button-connect-google-calendar"
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <SiGoogle className="w-4 h-4" />
                      {calendarLoading ? 'Connecting…' : 'Connect Google Calendar'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={syncToGoogle}
                        disabled={calendarLoading || tasksWithDates === 0}
                        data-testid="button-sync-to-google"
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${calendarLoading ? 'animate-spin' : ''}`} />
                        {calendarLoading ? 'Syncing to Google…' : `Sync ${tasksWithDates} Task${tasksWithDates !== 1 ? 's' : ''} to GC`}
                      </button>
                      <button
                        onClick={syncFromGoogle}
                        disabled={calendarLoading}
                        data-testid="button-sync-from-google"
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${calendarLoading ? 'animate-spin' : ''}`} />
                        {calendarLoading ? 'Syncing from Google…' : 'Import from Google Calendar'}
                      </button>
                      <button
                        onClick={disconnectCalendar}
                        disabled={calendarLoading}
                        data-testid="button-disconnect-calendar"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <Link2Off className="w-4 h-4" />
                        Disconnect
                      </button>
                    </>
                  )}
                </div>

                {!calendarConfigured && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    To enable Google Calendar sync, add <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to your environment secrets.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'energy' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-blue-50 to-amber-50 dark:from-blue-950/20 dark:to-amber-950/20 border border-border/50 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-amber-500 flex items-center justify-center flex-shrink-0">
                    <Battery className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-foreground mb-2">Energy Levels</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Optimize your productivity by matching tasks to your energy levels throughout the day. 
                      High-energy periods are perfect for demanding tasks, while low-energy times are ideal for routine work.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-muted/50 to-muted/30 px-6 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Daily Energy Schedule
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">Configure your energy patterns for optimal task scheduling</p>
                </div>
                
                <div className="divide-y divide-border/50">
                  <EnergySelector value={energyMorning} onChange={setEnergyMorning} label="Morning" time="07:00 – 12:00" />
                  <EnergySelector value={energyAfternoon} onChange={setEnergyAfternoon} label="Afternoon" time="12:00 – 17:00" />
                  <EnergySelector value={energyEvening} onChange={setEnergyEvening} label="Evening" time="17:00 – 22:00" />
                </div>
              </div>

              <div className="flex items-center justify-between bg-muted/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Smart Scheduling</p>
                    <p className="text-xs text-muted-foreground">AI will use these patterns to optimize your task schedule</p>
                  </div>
                </div>
                <button 
                  onClick={saveEnergyLevels} 
                  data-testid="button-save-energy" 
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <CheckCircle className="w-4 h-4" />
                  Save Energy Levels
                </button>
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
                <EnergyAnalytics />
              )}

              {historyTab === 'deepfocus' && (
                <div className="space-y-3">
                  {deepFocusLoading ? (
                    <div className="text-sm text-muted-foreground py-4 text-center">Loading sessions…</div>
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

          {activeSection === 'account' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-4">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="w-14 h-14 rounded-full" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
                      {initials}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase mt-1 inline-block">
                      {user?.subscriptionTier === 'free' ? 'Free Plan' : user?.subscriptionTier === 'pro' ? 'Premium Plan' : user?.subscriptionTier === 'premium' ? 'Pro Plan' : 'Free Plan'}
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
              </div>
            </div>
          )}

          {activeSection === 'tickets' && (() => {
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
                      placeholder="Search tickets…"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    {ticketSearch && (
                      <button onClick={() => setTicketSearch('')} className="text-muted-foreground hover:text-foreground">
                        <XCircle className="w-3.5 h-3.5" />
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
                          <span className="text-xs text-muted-foreground">{ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : ''}</span>
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
              </div>
            );
          })()}

          {activeSection === 'security' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Privacy & Security</h2>
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
        </div>
      </div>
      {activePanelTicket && (
        <TicketConversation
          ticket={activePanelTicket}
          messages={panelMessages}
          viewAs="user"
          currentUserName={user?.name || 'You'}
          onClose={() => { setActivePanelTicket(null); setPanelMessages([]); }}
          onSendMessage={handleSendTicketMessage}
          sending={sendingMessage}
        />
      )}
    </div>
  );
};

export default SettingsPage;