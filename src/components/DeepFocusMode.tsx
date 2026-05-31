import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Brain, Plus, AlertTriangle, Volume2, VolumeX, CheckCircle2, LifeBuoy } from 'lucide-react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, Subtask } from '@/types/board';

interface TodayStats {
  sessions: number;
  minutes: number;
}

type Pill = '20' | '30' | '40' | '60' | 'custom';
type SoundType = 'lofi' | 'rain' | 'whitenoise' | 'cafe' | 'nature';

interface DeepFocusModeProps {
  task?: Task;
}

const PILL_LABELS: Record<Pill, string> = {
  '20': '20 min',
  '30': '30 min',
  '40': '40 min',
  '60': '60 min',
  custom: 'Custom',
};

const SESSION_LABELS: Record<Pill, string> = {
  '20': 'Short Session',
  '30': 'Medium Session',
  '40': 'Long Session',
  '60': 'Deep Session',
  custom: 'Custom Session',
};

const SOUND_OPTIONS: { id: SoundType; label: string }[] = [
  { id: 'lofi', label: 'Lofi' },
  { id: 'rain', label: 'Rain' },
  { id: 'whitenoise', label: 'White Noise' },
  { id: 'cafe', label: 'Café Ambience' },
  { id: 'nature', label: 'Nature' },
];

function createSoundEngine(ctx: AudioContext, type: SoundType): () => void {
  const nodes: AudioNode[] = [];

  const makeNoise = (gainVal = 0.15) => {
    const bufferSize = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = gainVal;
    src.connect(gain);
    nodes.push(src, gain);
    return { src, gain };
  };

  if (type === 'whitenoise') {
    // Proper flat continuous broadband noise tone with no variation or melody
    const { src, gain } = makeNoise(0.12);
    gain.connect(ctx.destination);
    src.start();
  } else if (type === 'rain') {
    // Continuous steady actual rainfall sound
    const { src, gain } = makeNoise(0.25);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    gain.connect(filter);
    filter.connect(ctx.destination);
    src.start();
    nodes.push(filter);
    
    // Add subtle variation to mimic natural rain
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    nodes.push(lfo, lfoGain);
  } else if (type === 'lofi') {
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = 110;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 165;
    osc2.detune.value = 8;
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(filter);
    filter.connect(ctx.destination);
    osc1.start();
    osc2.start();
    nodes.push(osc1, osc2, gain, filter);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.1;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 20;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfo.start();
    nodes.push(lfo, lfoGain);
  } else if (type === 'cafe') {
    // Background chatter, light clinking of cups, soft indistinct conversation, faint background music
    const { src, gain } = makeNoise(0.15);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.5;
    gain.connect(bp);
    bp.connect(ctx.destination);
    src.start();
    nodes.push(bp);
    
    // Add some higher frequency elements for café ambience
    const { src: src2, gain: gain2 } = makeNoise(0.04);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    gain2.connect(hp);
    hp.connect(ctx.destination);
    src2.start();
    nodes.push(hp);
    
    // Add low frequency rumble for background
    const lfOsc = ctx.createOscillator();
    lfOsc.type = 'sine';
    lfOsc.frequency.value = 80;
    const lfGain = ctx.createGain();
    lfGain.gain.value = 0.03;
    lfOsc.connect(lfGain);
    lfGain.connect(ctx.destination);
    lfOsc.start();
    nodes.push(lfOsc, lfGain);
  } else if (type === 'nature') {
    const { src, gain } = makeNoise(0.18);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 200;
    gain.connect(hp);
    hp.connect(lp);
    lp.connect(ctx.destination);
    src.start();
    nodes.push(lp, hp);
  }

  return () => {
    nodes.forEach(n => {
      try {
        if (n instanceof AudioBufferSourceNode || n instanceof OscillatorNode) (n as any).stop();
        n.disconnect();
      } catch {}
    });
  };
}

function playCompletionBeep(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.2);
}

const DeepFocusMode: React.FC<DeepFocusModeProps> = ({ task: propTask }) => {
  const { board, updateTask } = useBoardContext();

  const [selectedTask, setSelectedTask] = useState<Task | null>(propTask || null);
  const [activePill, setActivePill] = useState<Pill>('30');
  const [customMinutes, setCustomMinutes] = useState(0);
  const [customInput, setCustomInput] = useState('');
  const [showCustomPopup, setShowCustomPopup] = useState(false);

  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [totalSecs, setTotalSecs] = useState(30 * 60);
  const [isRunning, setIsRunning] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [selectedSound, setSelectedSound] = useState<SoundType>('rain');
  const [showSoundPicker, setShowSoundPicker] = useState(false);

  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [todayStats, setTodayStats] = useState<TodayStats>({ sessions: 0, minutes: 0 });

  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundCleanupRef = useRef<(() => void) | null>(null);
  const customPopupRef = useRef<HTMLDivElement>(null);

  const getDurationSecs = useCallback((pill: Pill, customMins: number) => {
    if (pill === 'custom') return (customMins || 30) * 60;
    return parseInt(pill) * 60;
  }, []);

  useEffect(() => {
    if (selectedTask) {
      const latest = board.tasks.find(t => t.id === selectedTask.id);
      if (latest) setSelectedTask(latest);
    }
  }, [board.tasks]);

  useEffect(() => {
    fetchTodayStats();
  }, []);

  const fetchTodayStats = async () => {
    try {
      const res = await fetch('/api/deep-focus/sessions/today', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTodayStats(data);
      }
    } catch {}
  };

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const startSound = () => {
    stopSound();
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    soundCleanupRef.current = createSoundEngine(ctx, selectedSound);
  };

  const stopSound = () => {
    if (soundCleanupRef.current) {
      soundCleanupRef.current();
      soundCleanupRef.current = null;
    }
  };

  const handleStartSession = () => {
    const secs = getDurationSecs(activePill, customMinutes);
    setTimeLeft(secs);
    setTotalSecs(secs);
    setIsRunning(true);
    if (soundEnabled) startSound();
  };

  const handlePause = () => {
    setIsRunning(false);
    stopSound();
  };

  const handleResume = () => {
    setIsRunning(true);
    if (soundEnabled) startSound();
  };

  const handleTimerComplete = () => {
    setIsRunning(false);
    stopSound();
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume().then(() => playCompletionBeep(ctx));
    else playCompletionBeep(ctx);
    setShowCompletionDialog(true);
  };

  const saveSession = async (completed: boolean) => {
    const minutes = Math.round(totalSecs / 60);
    const taskName = selectedTask?.title || 'Focus Session';
    const taskId = selectedTask?.id?.toString() || null;
    try {
      await fetch('/api/deep-focus/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId, taskName, durationMinutes: minutes, completed }),
      });
      fetchTodayStats();
    } catch {}
  };

  const handleCompletedTask = async () => {
    await saveSession(true);
    setShowCompletionDialog(false);
    document.dispatchEvent(new CustomEvent('closeDeepFocus'));
  };

  const handleAnotherSession = async () => {
    await saveSession(false);
    setShowCompletionDialog(false);
    const secs = getDurationSecs(activePill, customMinutes);
    setTimeLeft(secs);
    setTotalSecs(secs);
  };

  const selectPill = (pill: Pill) => {
    if (pill === 'custom') {
      setShowCustomPopup(true);
      return;
    }
    setActivePill(pill);
    setCustomMinutes(0);
    setShowCustomPopup(false);
    if (!isRunning) {
      const secs = parseInt(pill) * 60;
      setTimeLeft(secs);
      setTotalSecs(secs);
    }
  };

  const saveCustomDuration = () => {
    const mins = parseInt(customInput) || 0;
    if (mins < 1) return;
    setCustomMinutes(mins);
    setActivePill('custom');
    setShowCustomPopup(false);
    if (!isRunning) {
      setTimeLeft(mins * 60);
      setTotalSecs(mins * 60);
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      setShowSoundPicker(true);
    } else {
      setShowSoundPicker(false);
      stopSound();
    }
  };

  const selectSound = (s: SoundType) => {
    setSelectedSound(s);
    if (soundEnabled && isRunning) {
      stopSound();
      setTimeout(() => {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        soundCleanupRef.current = createSoundEngine(ctx, s);
      }, 50);
    }
  };

  const addSubtask = () => {
    if (!selectedTask || !newSubtaskText.trim()) return;
    const dur = parseInt(newSubtaskDuration) || 0;
    const newSub: Subtask = {
      id: crypto.randomUUID(),
      text: newSubtaskText.trim(),
      completed: false,
      durationMinutes: dur,
    };
    updateTask(selectedTask.id, { subtasks: [...(selectedTask.subtasks || []), newSub] });
    setNewSubtaskText('');
    setNewSubtaskDuration('');
  };

  const toggleSubtask = (id: string) => {
    if (!selectedTask) return;
    updateTask(selectedTask.id, {
      subtasks: selectedTask.subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s),
    });
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progress = totalSecs > 0 ? ((totalSecs - timeLeft) / totalSecs) * 100 : 0;
  const r = 88;
  const circ = 2 * Math.PI * r;

  const subtaskTotalMins = selectedTask?.subtasks?.reduce((a, s) => a + (s.durationMinutes || 0), 0) ?? 0;
  const taskDurMins = selectedTask?.duration ?? 0;
  const durationMismatch = taskDurMins > 0 && subtaskTotalMins > 0 && subtaskTotalMins !== taskDurMins;

  const pillLabel = activePill === 'custom' && customMinutes > 0 ? `${customMinutes} min` : PILL_LABELS[activePill];

  const close = () => {
    stopSound();
    document.dispatchEvent(new CustomEvent('closeDeepFocus'));
  };

  // Navigate to the Resources page in the Support tab
  const handleHelpClick = () => {
    // Since the Resources page doesn't exist yet, we'll navigate to the support page
    // In the future, this should navigate to /support/resources when it's created
    window.location.hash = '#/support';
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-500 ${
        isRunning ? 'bg-black backdrop-blur-xl' : 'bg-white backdrop-blur-lg'
      }`}
      onClick={(e) => { if (e.target === e.currentTarget && !isRunning) close(); }}
    >
      {showCompletionDialog && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className={`border rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center ${
            isRunning ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className={`w-8 h-8 ${isRunning ? 'text-primary' : 'text-primary'}`} />
            </div>
            <h3 className={`text-lg font-bold ${isRunning ? 'text-white' : 'text-foreground'}`}>Session Complete!</h3>
            <p className={`text-sm ${isRunning ? 'text-gray-300' : 'text-muted-foreground'} mb-6`}>
              Great work! Did you complete <span className={`font-medium ${isRunning ? 'text-white' : 'text-foreground'}`}>{selectedTask?.title || 'the task'}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleAnotherSession}
                className={`flex-1 py-2.5 px-4 text-sm font-medium border rounded-xl ${
                  isRunning 
                    ? 'text-gray-300 border-gray-600 hover:bg-gray-800' 
                    : 'text-muted-foreground border-border hover:bg-muted'
                } transition-all`}
              >
                Start Another
              </button>
              <button
                onClick={handleCompletedTask}
                className="flex-1 py-2.5 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all"
              >
                Yes, Done!
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl ${
          isRunning ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
        } border relative`}
        onClick={e => e.stopPropagation()}
      >
        {/* Help button in bottom left corner */}
        <button
          onClick={handleHelpClick}
          className={`absolute bottom-4 left-4 p-2 rounded-full transition-colors z-10 ${
            isRunning 
              ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          aria-label="Help"
        >
          <LifeBuoy className="w-5 h-5" />
        </button>
        
        <div className={`flex items-center justify-between px-6 py-4 ${
          isRunning ? 'border-b border-gray-700' : 'border-b border-border'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center ${
              isRunning ? 'bg-primary/10' : ''
            }`}>
              <Brain className={`w-4.5 h-4.5 ${isRunning ? 'text-primary' : 'text-primary'}`} />
            </div>
            <div>
              <h2 className={`text-sm font-bold ${isRunning ? 'text-white' : 'text-foreground'}`}>Deep Focus Mode</h2>
              <p className={`text-xs ${isRunning ? 'text-gray-400' : 'text-muted-foreground'}`}>
                {selectedTask ? `Focusing on: ${selectedTask.title}` : 'Select a task to focus on'}
              </p>
            </div>
          </div>
          <button
            onClick={close}
            className={`p-2 ${
              isRunning ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            } rounded-full transition-all`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 pb-16"> {/* Added pb-16 to account for help button */}
          {/* Timer */}
          <div className="flex flex-col items-center">
            <div className="relative w-44 h-44 mb-4">
              <svg className="w-full h-full -rotate-90">
                {/* Background circle - always visible */}
                <circle 
                  cx="88" 
                  cy="88" 
                  r={r} 
                  stroke={isRunning ? "currentColor" : "currentColor"} 
                  strokeWidth="7" 
                  fill="none" 
                  className={isRunning ? "text-gray-700" : "text-muted/20"} 
                />
                {/* Progress circle - fills proportionally */}
                <circle
                  cx="88" 
                  cy="88" 
                  r={r}
                  stroke={isRunning ? "currentColor" : "currentColor"} 
                  strokeWidth="7" 
                  fill="none"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - progress / 100)}
                  strokeLinecap="round"
                  className={`${isRunning ? 'text-white' : 'text-primary'} transition-all duration-1000 ease-linear`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className={`text-3xl font-bold tabular-nums ${isRunning ? 'text-white' : 'text-foreground'}`}>{formatTime(timeLeft)}</div>
                <div className={`text-xs mt-0.5 ${isRunning ? 'text-gray-400' : 'text-muted-foreground'}`}>{SESSION_LABELS[activePill]}</div>
              </div>
            </div>

            {/* Pill buttons */}
            <div className="relative flex gap-1.5 flex-wrap justify-center mb-3">
              {(['20', '30', '40', '60'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => selectPill(p)}
                  disabled={isRunning}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-50 ${
                    activePill === p
                      ? isRunning 
                        ? 'bg-white text-gray-900' 
                        : 'bg-foreground text-background'
                      : isRunning
                        ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {p} min
                </button>
              ))}
              {/* Custom pill */}
              <div className="relative">
                <button
                  onClick={() => selectPill('custom')}
                  disabled={isRunning}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-50 ${
                    activePill === 'custom'
                      ? isRunning 
                        ? 'bg-white text-gray-900' 
                        : 'bg-foreground text-background'
                      : isRunning
                        ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {activePill === 'custom' && customMinutes > 0 ? `${customMinutes} min` : 'Custom'}
                </button>

                {showCustomPopup && (
                  <div
                    ref={customPopupRef}
                    className={`absolute top-full mt-2 right-0 ${
                      isRunning ? 'bg-gray-800 border-gray-700' : 'bg-card border-border'
                    } rounded-xl shadow-xl p-4 z-20 w-48`}
                  >
                    <p className={`text-xs font-semibold mb-2 ${isRunning ? 'text-white' : 'text-foreground'}`}>Custom duration</p>
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="number"
                        min="1"
                        max="240"
                        value={customInput}
                        onChange={e => setCustomInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveCustomDuration()}
                        placeholder="e.g. 92"
                        className={`w-full px-2.5 py-1.5 ${
                          isRunning ? 'bg-gray-700 border-gray-600 text-white' : 'bg-muted border-border text-foreground'
                        } rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30`}
                        autoFocus
                      />
                      <span className={`text-xs ${isRunning ? 'text-gray-400' : 'text-muted-foreground'} flex-shrink-0`}>min</span>
                    </div>
                    <button
                      onClick={saveCustomDuration}
                      className="w-full py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-all"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Removed: Set custom duration button */}
          </div>

          {/* Subtasks */}
          {selectedTask && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wide ${isRunning ? 'text-white' : 'text-foreground'}`}>Subtasks</span>
                <div className="flex items-center gap-2">
                  {durationMismatch && (
                    <span className="flex items-center gap-1 text-[10px] text-orange-500 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Sub-task time does not match task duration
                    </span>
                  )}
                  <span className={`text-xs ${isRunning ? 'text-gray-400' : 'text-muted-foreground'}`}>
                    {selectedTask.subtasks?.filter(s => s.completed).length || 0} / {selectedTask.subtasks?.length || 0} completed
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 mb-3 max-h-44 overflow-y-auto">
                {selectedTask.subtasks?.map(sub => (
                  <div 
                    key={sub.id} 
                    className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-all ${
                      isRunning ? 'hover:bg-gray-800/50' : 'hover:bg-muted/30'
                    }`}
                  >
                    <button
                      onClick={() => toggleSubtask(sub.id)}
                      className={`w-4.5 h-4.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                        sub.completed
                          ? isRunning 
                            ? 'bg-green-500 border-green-500' 
                            : 'bg-green-500 border-green-500'
                          : isRunning
                            ? 'border-gray-500 hover:border-green-400'
                            : 'border-muted-foreground/40 hover:border-green-400'
                      }`}
                      style={{ width: 18, height: 18 }}
                    >
                      {sub.completed && (
                        <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-white" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                    <span className={`flex-1 text-sm ${
                      sub.completed 
                        ? isRunning 
                          ? 'line-through text-gray-500' 
                          : 'line-through text-muted-foreground'
                        : isRunning
                          ? 'text-gray-300'
                          : 'text-foreground'
                    }`}>
                      {sub.text}
                    </span>
                    {(sub.durationMinutes ?? 0) > 0 && (
                      <span className={`text-xs flex-shrink-0 ${
                        isRunning ? 'text-gray-400' : 'text-muted-foreground'
                      }`}>{sub.durationMinutes} min</span>
                    )}
                  </div>
                ))}
                {(!selectedTask.subtasks || selectedTask.subtasks.length === 0) && (
                  <p className={`text-xs text-center py-2 ${isRunning ? 'text-gray-500' : 'text-muted-foreground'}`}>No subtasks yet</p>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSubtaskText}
                  onChange={e => setNewSubtaskText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSubtask()}
                  placeholder="Add sub-task..."
                  className={`flex-1 px-3 py-1.5 ${
                    isRunning ? 'bg-gray-800/50 border-gray-700 text-white' : 'bg-muted/50 border-border text-foreground'
                  } rounded-lg text-sm placeholder:${
                    isRunning ? 'text-gray-500' : 'text-muted-foreground'
                  } outline-none focus:ring-2 focus:ring-primary/30`}
                />
                <input
                  type="number"
                  value={newSubtaskDuration}
                  onChange={e => setNewSubtaskDuration(e.target.value)}
                  placeholder="min"
                  className={`w-16 px-2 py-1.5 ${
                    isRunning ? 'bg-gray-800/50 border-gray-700 text-white' : 'bg-muted/50 border-border text-foreground'
                  } rounded-lg text-sm placeholder:${
                    isRunning ? 'text-gray-500' : 'text-muted-foreground'
                  } outline-none focus:ring-2 focus:ring-primary/30 text-center`}
                />
                <button
                  onClick={addSubtask}
                  disabled={!newSubtaskText.trim()}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Start / Pause */}
          <div>
            {!isRunning ? (
              <button
                onClick={timeLeft < totalSecs && totalSecs > 0 && timeLeft > 0 ? handleResume : handleStartSession}
                className="w-full py-3 bg-foreground text-background rounded-xl font-semibold text-sm hover:opacity-90 flex items-center justify-center gap-2 transition-all"
              >
                <Play className="w-4 h-4" />
                {timeLeft < totalSecs && timeLeft > 0 ? 'Resume Session' : 'Start Session'}
              </button>
            ) : (
              <button
                onClick={handlePause}
                className={`w-full py-3 ${
                  isRunning ? 'bg-gray-700 text-gray-300' : 'bg-muted text-muted-foreground'
                } rounded-xl font-semibold text-sm ${
                  isRunning ? 'hover:bg-gray-600' : 'hover:bg-muted/80'
                } flex items-center justify-center gap-2 transition-all`}
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}
          </div>

          {/* Sound */}
          <div className="space-y-3">
            <button
              onClick={toggleSound}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                soundEnabled
                  ? isRunning
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-primary/10 border-primary/30 text-primary'
                  : isRunning
                    ? 'bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-700'
                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {soundEnabled ? 'Sound On' : 'Sound Off'}
            </button>

            {soundEnabled && (
              <div className="flex gap-2 flex-wrap">
                {SOUND_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => selectSound(opt.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selectedSound === opt.id
                        ? isRunning
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-primary text-primary-foreground border-primary'
                        : isRunning
                          ? 'bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-700'
                          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Today's Progress */}
          <div className={`rounded-xl p-4 ${
            isRunning ? 'bg-gray-800/30' : 'bg-muted/30'
          }`}>
            <h3 className={`text-xs font-semibold mb-3 ${isRunning ? 'text-white' : 'text-foreground'}`}>Today's Progress</h3>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className={`text-2xl font-bold ${isRunning ? 'text-primary' : 'text-primary'}`}>{todayStats.sessions}</div>
                <div className={`text-xs ${isRunning ? 'text-gray-400' : 'text-muted-foreground'}`}>Sessions</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${isRunning ? 'text-primary' : 'text-primary'}`}>{todayStats.minutes}</div>
                <div className={`text-xs ${isRunning ? 'text-gray-400' : 'text-muted-foreground'}`}>Minutes</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepFocusMode;