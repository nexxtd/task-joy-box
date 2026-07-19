import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Brain, Plus, Volume2, VolumeX, CheckCircle2, Trash2, GripVertical, Paperclip, Image, ChevronDown, ChevronUp } from 'lucide-react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, Subtask } from '@/types/board';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';

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

const SOUND_OPTIONS: { id: SoundType; label: string }[] = [
  { id: 'lofi', label: 'Lofi' },
  { id: 'rain', label: 'Rain' },
  { id: 'whitenoise', label: 'White Noise' },
  { id: 'cafe', label: 'Cafe Ambience' },
  { id: 'nature', label: 'Nature' },
];

function createSoundEngine(ctx: AudioContext, type: SoundType): () => void {
  const nodes: AudioNode[] = [];

  const makeNoise = (gainVal = 0.15) => {
    const bufferSize = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;
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
    const { src, gain } = makeNoise(0.12);
    gain.connect(ctx.destination);
    src.start();
  } else if (type === 'rain') {
    const { src, gain } = makeNoise(0.25);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    gain.connect(filter);
    filter.connect(ctx.destination);
    src.start();
    nodes.push(filter);

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
    const { src, gain } = makeNoise(0.15);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.5;
    gain.connect(bp);
    bp.connect(ctx.destination);
    src.start();
    nodes.push(bp);

    const { src: src2, gain: gain2 } = makeNoise(0.04);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    gain2.connect(hp);
    hp.connect(ctx.destination);
    src2.start();
    nodes.push(hp);

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
    nodes.forEach(node => {
      try {
        if (node instanceof AudioBufferSourceNode || node instanceof OscillatorNode) (node as any).stop();
        node.disconnect();
      } catch {
        // ignore cleanup failures
      }
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
  const { board, updateTask, addChecklist, addChecklistItem: addChecklistItemToBoard, toggleChecklistItem, deleteChecklistItem } = useBoardContext();

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
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [todayStats, setTodayStats] = useState<TodayStats>({ sessions: 0, minutes: 0 });

  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState(10);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [collapsedDraftChecklists, setCollapsedDraftChecklists] = useState<Set<string>>(new Set());
  const [editingDraftChecklistId, setEditingDraftChecklistId] = useState<string | null>(null);
  const [editingDraftChecklistTitle, setEditingDraftChecklistTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [subtasksCollapsed, setSubtasksCollapsed] = useState(false);
  const [checklistsCollapsed, setChecklistsCollapsed] = useState(false);
  const [attachmentsCollapsed, setAttachmentsCollapsed] = useState(false);
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [progressCollapsed, setProgressCollapsed] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [editingSubtaskDuration, setEditingSubtaskDuration] = useState(0);
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistItemText, setEditingChecklistItemText] = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundCleanupRef = useRef<(() => void) | null>(null);
  const customPopupRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number | null>(null);
  const totalSecsRef = useRef(totalSecs);
  const activePillRef = useRef(activePill);
  const customMinutesRef = useRef(customMinutes);
  const soundEnabledRef = useRef(soundEnabled);
  const selectedSoundRef = useRef(selectedSound);
  const handleTimerCompleteRef = useRef<() => void>(() => {});
  const startSoundRef = useRef<(sound?: SoundType) => void>(() => {});
  const stopSoundRef = useRef<() => void>(() => {});

  const getDurationSecs = useCallback((pill: Pill, mins: number) => {
    if (pill === 'custom') return (mins || 30) * 60;
    return parseInt(pill, 10) * 60;
  }, []);

  useEffect(() => {
    setSelectedTask(propTask || null);
  }, [propTask]);

  useEffect(() => {
    if (!selectedTask) return;
    const latest = board.tasks.find(t => t.id === selectedTask.id);
    if (latest) setSelectedTask(latest);
  }, [board.tasks, selectedTask?.id]);

  useEffect(() => {
    const fetchTodayStats = async () => {
      try {
        const res = await fetch('/api/deep-focus/sessions/today', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setTodayStats(data);
        }
      } catch {
        // ignore
      }
    };
    fetchTodayStats();
  }, []);

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const stopSound = useCallback(() => {
    if (soundCleanupRef.current) {
      soundCleanupRef.current();
      soundCleanupRef.current = null;
    }
  }, []);

  const startSound = useCallback((sound: SoundType = selectedSound) => {
    stopSound();
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    soundCleanupRef.current = createSoundEngine(ctx, sound);
  }, [selectedSound, stopSound]);

  const tick = useCallback(() => {
    if (!startedAtRef.current) return;
    const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
    const remaining = Math.max(0, totalSecsRef.current - elapsed);
    setTimeLeft(remaining);
    if (remaining <= 0) {
      setIsRunning(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      handleTimerCompleteRef.current();
    }
  }, []);

  useEffect(() => { totalSecsRef.current = totalSecs; }, [totalSecs]);
  useEffect(() => { activePillRef.current = activePill; }, [activePill]);
  useEffect(() => { customMinutesRef.current = customMinutes; }, [customMinutes]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { selectedSoundRef.current = selectedSound; }, [selectedSound]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      startedAtRef.current = null;
      return;
    }

    tick();

    intervalRef.current = setInterval(tick, 200);

    const handleVisibility = () => { tick(); };
    document.addEventListener('visibilitychange', handleVisibility);
    const handleFocus = () => { tick(); };
    window.addEventListener('focus', handleFocus);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isRunning]);

  const handleStartSession = useCallback(() => {
    const secs = getDurationSecs(activePill, customMinutes);
    startedAtRef.current = Date.now();
    totalSecsRef.current = secs;
    setTimeLeft(secs);
    setTotalSecs(secs);
    setIsRunning(true);
    if (soundEnabled) startSound();
  }, [activePill, customMinutes, getDurationSecs, soundEnabled, startSound]);

  const handlePause = useCallback(() => {
    setIsRunning(false);
    stopSound();
  }, [stopSound]);

  const handleResume = useCallback(() => {
    const elapsed = totalSecs - timeLeft;
    startedAtRef.current = Date.now() - elapsed * 1000;
    setIsRunning(true);
    if (soundEnabled) startSound();
  }, [soundEnabled, startSound, totalSecs, timeLeft]);

  const saveSession = useCallback(async (completed: boolean) => {
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
      const res = await fetch('/api/deep-focus/sessions/today', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTodayStats(data);
      }
    } catch {
      // ignore
    }
  }, [selectedTask, totalSecs]);

  const handleTimerComplete = useCallback(() => {
    setIsRunning(false);
    stopSound();
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playCompletionBeep(ctx));
    } else {
      playCompletionBeep(ctx);
    }
    setShowCompletionDialog(true);
  }, [stopSound]);

  useEffect(() => { handleTimerCompleteRef.current = handleTimerComplete; }, [handleTimerComplete]);
  useEffect(() => { startSoundRef.current = startSound; }, [startSound]);
  useEffect(() => { stopSoundRef.current = stopSound; }, [stopSound]);

  const handleCompletedTask = useCallback(() => {
    setShowCompletionDialog(false);
    setShowDetailDialog(true);
  }, []);

  const handleFinalComplete = useCallback(async () => {
    await saveSession(true);
    setShowDetailDialog(false);
    document.dispatchEvent(new CustomEvent('closeDeepFocus'));
  }, [saveSession]);

  const handleBackToCompletion = useCallback(() => {
    setShowDetailDialog(false);
    setShowCompletionDialog(true);
  }, []);

  const handleAnotherSession = useCallback(async () => {
    await saveSession(false);
    setShowCompletionDialog(false);
    const secs = getDurationSecs(activePill, customMinutes);
    setTimeLeft(secs);
    setTotalSecs(secs);
  }, [activePill, customMinutes, getDurationSecs, saveSession]);

  const selectPill = useCallback((pill: Pill) => {
    if (pill === 'custom') {
      setShowCustomPopup(true);
      return;
    }
    setActivePill(pill);
    setCustomMinutes(0);
    setShowCustomPopup(false);
    if (!isRunning) {
      const secs = parseInt(pill, 10) * 60;
      setTimeLeft(secs);
      setTotalSecs(secs);
    }
  }, [isRunning]);

  const saveCustomDuration = useCallback(() => {
    const mins = parseInt(customInput, 10) || 0;
    if (mins < 1) return;
    setCustomMinutes(mins);
    setActivePill('custom');
    setShowCustomPopup(false);
    if (!isRunning) {
      setTimeLeft(mins * 60);
      setTotalSecs(mins * 60);
    }
  }, [customInput, isRunning]);

  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      setShowSoundPicker(true);
      if (isRunning) startSound();
    } else {
      setShowSoundPicker(false);
      stopSound();
    }
  }, [isRunning, soundEnabled, startSound, stopSound]);

  const selectSound = useCallback((sound: SoundType) => {
    setSelectedSound(sound);
    if (soundEnabled && isRunning) {
      startSound(sound);
    }
  }, [isRunning, soundEnabled, startSound]);

  const addSubtask = useCallback(() => {
    if (!selectedTask || !newSubtaskText.trim()) return;
    const dur = newSubtaskDuration || 0;
    const newSub: Subtask = {
      id: crypto.randomUUID(),
      text: newSubtaskText.trim(),
      completed: false,
      durationMinutes: dur,
    };
    updateTask(selectedTask.id, {
      subtasks: [...(selectedTask.subtasks || []), newSub],
    });
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  }, [newSubtaskDuration, newSubtaskText, selectedTask, updateTask]);

  const taskChecklists = selectedTask?.checklists ?? [];
  const legacySubtasksChecklist = taskChecklists.find(cl => cl.title.toLowerCase().trim() === 'subtasks');
  const focusChecklists = taskChecklists.filter(cl => cl.id !== legacySubtasksChecklist?.id);
  const focusChecklistItems = focusChecklists.flatMap(cl => cl.items.map(item => ({ ...item, checklistId: cl.id })));

  const toggleSubtask = useCallback((id: string) => {
    if (!selectedTask) return;
    updateTask(selectedTask.id, {
      subtasks: selectedTask.subtasks.map(s => (s.id === id ? { ...s, completed: !s.completed } : s)),
    });
  }, [selectedTask, updateTask]);

  const deleteSubtask = useCallback((id: string) => {
    if (!selectedTask) return;
    updateTask(selectedTask.id, {
      subtasks: selectedTask.subtasks.filter(s => s.id !== id),
    });
  }, [selectedTask, updateTask]);

  const saveSubtaskEdit = useCallback((id: string) => {
    if (!selectedTask) return;
    updateTask(selectedTask.id, {
      subtasks: selectedTask.subtasks.map(s =>
        s.id === id ? { ...s, text: editingSubtaskText, durationMinutes: editingSubtaskDuration } : s
      ),
    });
    setEditingSubtaskId(null);
  }, [editingSubtaskDuration, editingSubtaskText, selectedTask, updateTask]);

  const saveChecklistItemEdit = useCallback((checklistId: string, itemId: string) => {
    if (!selectedTask || !editingChecklistItemText.trim()) return;
    updateTask(selectedTask.id, {
      checklists: selectedTask.checklists.map(cl =>
        cl.id === checklistId
          ? { ...cl, items: cl.items.map(it => it.id === itemId ? { ...it, text: editingChecklistItemText.trim() } : it) }
          : cl
      ),
    });
    setEditingChecklistItemId(null);
  }, [editingChecklistItemText, selectedTask, updateTask]);

  const startEditing = useCallback((sub: Subtask) => {
    setEditingSubtaskId(sub.id);
    setEditingSubtaskText(sub.text);
    setEditingSubtaskDuration(sub.durationMinutes || 0);
  }, []);

  const updateSubtaskDuration = useCallback((id: string, durationMinutes: number) => {
    if (!selectedTask) return;
    updateTask(selectedTask.id, {
      subtasks: selectedTask.subtasks.map(s =>
        s.id === id ? { ...s, durationMinutes } : s
      ),
    });
  }, [selectedTask, updateTask]);

  const handleAddChecklistItem = useCallback(() => {
    if (!selectedTask || !newChecklistText.trim()) return;
    const text = newChecklistText.trim();
    const targetChecklist = focusChecklists[0];

    if (targetChecklist) {
      addChecklistItemToBoard(selectedTask.id, targetChecklist.id, text);
    } else {
      updateTask(selectedTask.id, {
        checklists: [
          ...taskChecklists,
          {
            id: crypto.randomUUID(),
            title: 'Checklist',
            items: [{ id: crypto.randomUUID(), text, completed: false }],
          },
        ],
      });
    }

    setNewChecklistText('');
  }, [addChecklistItemToBoard, focusChecklists, newChecklistText, selectedTask, taskChecklists, updateTask]);

  const addChecklistItemToList = useCallback((listId: string) => {
    if (!selectedTask) return;
    const text = (perChecklistInput[listId] ?? '').trim();
    if (!text) return;
    addChecklistItemToBoard(selectedTask.id, listId, text);
    setPerChecklistInput(prev => ({ ...prev, [listId]: '' }));
  }, [addChecklistItemToBoard, perChecklistInput, selectedTask]);

  const addNamedChecklist = useCallback(() => {
    if (!selectedTask || !newChecklistTitle.trim()) return;
    addChecklist(selectedTask.id, newChecklistTitle.trim());
    setNewChecklistTitle('');
  }, [addChecklist, newChecklistTitle, selectedTask]);

  const addNamedChecklistItem = useCallback((listId: string) => {
    if (!selectedTask) return;
    const text = (perChecklistInput[listId] ?? '').trim();
    if (!text) return;
    addChecklistItemToBoard(selectedTask.id, listId, text);
    setPerChecklistInput(prev => ({ ...prev, [listId]: '' }));
  }, [addChecklistItemToBoard, perChecklistInput, selectedTask]);

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!selectedTask || files.length === 0) return;
    const uploaded: any[] = [];
    for (const file of files) {
      uploaded.push({
        id: crypto.randomUUID(),
        taskId: selectedTask.id,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        fileUrl: await fileToDataUrl(file),
        createdAt: new Date().toISOString(),
      });
    }
    if (uploaded.length > 0) {
      updateTask(selectedTask.id, { attachments: [...(selectedTask.attachments || []), ...uploaded] });
    }
    e.currentTarget.value = '';
  }, [selectedTask, updateTask]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!selectedTask || files.length === 0) return;
    const uploaded: any[] = [];
    for (const file of files) {
      uploaded.push({
        id: crypto.randomUUID(),
        taskId: selectedTask.id,
        fileName: file.name,
        fileType: file.type || 'image/jpeg',
        fileSize: file.size,
        fileUrl: await fileToDataUrl(file),
        createdAt: new Date().toISOString(),
      });
    }
    if (uploaded.length > 0) {
      updateTask(selectedTask.id, { images: [...(selectedTask.images || []), ...uploaded] });
    }
    e.currentTarget.value = '';
  }, [selectedTask, updateTask]);

  const deleteAttachment = useCallback((id: string) => {
    if (!selectedTask) return;
    updateTask(selectedTask.id, {
      attachments: (selectedTask.attachments || []).filter(a => a.id !== id),
    });
  }, [selectedTask, updateTask]);

  const deleteImage = useCallback((id: string) => {
    if (!selectedTask) return;
    updateTask(selectedTask.id, {
      images: (selectedTask.images || []).filter(i => i.id !== id),
    });
  }, [selectedTask, updateTask]);

  const handleDeepFocusReorder = useCallback((result: DropResult) => {
    if (!result.destination || !selectedTask) return;
    if (result.source.droppableId === 'deepfocus-subtasks') {
      const items = Array.from(selectedTask.subtasks ?? []);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      updateTask(selectedTask.id, { subtasks: items });
    } else if (result.source.droppableId === 'deepfocus-checklist-lists') {
      const items = Array.from(selectedTask.checklists ?? []);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      updateTask(selectedTask.id, { checklists: items });
    } else if (result.source.droppableId === 'deepfocus-checklist') {
      const items = Array.from(focusChecklistItems);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      const grouped: Record<string, { id: string; text: string; completed: boolean }[]> = {};
      items.forEach(item => {
        if (!grouped[item.checklistId]) grouped[item.checklistId] = [];
        grouped[item.checklistId].push({ id: item.id, text: item.text, completed: item.completed });
      });
      updateTask(selectedTask.id, {
        checklists: (selectedTask.checklists ?? []).map(cl =>
          grouped[cl.id] ? { ...cl, items: grouped[cl.id] } : cl
        ),
      });
    } else if (result.source.droppableId.startsWith('deepfocus-checklist-') && result.destination.droppableId.startsWith('deepfocus-checklist-')) {
      const srcListId = result.source.droppableId.replace('deepfocus-checklist-', '');
      const dstListId = result.destination.droppableId.replace('deepfocus-checklist-', '');
      const srcChecklist = (selectedTask.checklists ?? []).find(cl => cl.id === srcListId);
      const dstChecklist = (selectedTask.checklists ?? []).find(cl => cl.id === dstListId);
      if (!srcChecklist || !dstChecklist) return;
      const srcItems = Array.from(srcChecklist.items);
      const [removed] = srcItems.splice(result.source.index, 1);
      if (srcListId === dstListId) {
        srcItems.splice(result.destination.index, 0, removed);
        updateTask(selectedTask.id, {
          checklists: (selectedTask.checklists ?? []).map(cl =>
            cl.id === srcListId ? { ...cl, items: srcItems } : cl
          ),
        });
      } else {
        const dstItems = Array.from(dstChecklist.items);
        dstItems.splice(result.destination.index, 0, removed);
        updateTask(selectedTask.id, {
          checklists: (selectedTask.checklists ?? []).map(cl => {
            if (cl.id === srcListId) return { ...cl, items: srcItems };
            if (cl.id === dstListId) return { ...cl, items: dstItems };
            return cl;
          }),
        });
      }
    }
  }, [selectedTask, updateTask]);

  const taskSubtasks = selectedTask?.subtasks ?? [];
  const subtaskTotalMins = taskSubtasks.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const taskDurMins = selectedTask?.duration ?? 0;
  const remainingMins = taskDurMins - subtaskTotalMins;
  const allSubtasksDone = taskSubtasks.length > 0 && taskSubtasks.every(st => st.completed);
  const progress = totalSecs > 0 ? ((totalSecs - timeLeft) / totalSecs) * 100 : 0;
  const r = 88;
  const circ = 2 * Math.PI * r;
  const pillLabel = activePill === 'custom' && customMinutes > 0 ? `${customMinutes} min` : PILL_LABELS[activePill];

  const close = useCallback(() => {
    stopSound();
    document.dispatchEvent(new CustomEvent('closeDeepFocus'));
  }, [stopSound]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className={`absolute inset-0 transition-colors duration-500 ${isRunning ? 'bg-black/70' : 'bg-black/30'} backdrop-blur-sm`}
        onClick={() => { if (!isRunning) close(); }}
      />

      {showCompletionDialog && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="border rounded-2xl p-8 shadow-2xl w-[90vw] sm:max-w-sm mx-4 text-center bg-card border-border">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground">Session Complete!</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Great work! Did you complete <span className="font-medium text-foreground">{selectedTask?.title || 'the task'}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleAnotherSession}
                className="flex-1 py-2.5 px-4 text-sm font-medium border rounded-xl text-muted-foreground border-border hover:bg-muted transition-all"
              >
                Start Another
              </button>
              <button
                onClick={handleCompletedTask}
                className="flex-1 py-2.5 px-4 text-sm font-medium !bg-[#000] !text-white rounded-xl hover:opacity-90 transition-all"
              >
                Yes, Done!
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailDialog && selectedTask && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="border rounded-2xl p-8 shadow-2xl w-[90vw] sm:max-w-md mx-4 bg-card border-border max-h-[80vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4 min-w-0">
              <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="text-base font-bold text-foreground truncate">Review & Complete</h3>
                <p className="text-xs text-muted-foreground truncate">{selectedTask.title}</p>
              </div>
            </div>

            <div className="rounded-xl bg-muted/30 p-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Session Duration</span>
              <span className="text-sm font-semibold text-foreground">{Math.round(totalSecs / 60)} min</span>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 mb-4">
              <button
                onClick={() => setSubtasksCollapsed(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Sub-tasks</h3>
                  {taskSubtasks.length > 0 && (
                    <span className="text-xs text-muted-foreground">({taskSubtasks.length})</span>
                  )}
                </div>
                {subtasksCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
              </button>
              {!subtasksCollapsed && (
                <div className="border-t border-border/60 px-4 py-3 space-y-3">
                  {allSubtasksDone && (
                    <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
                      All sub-tasks are done ✓
                    </div>
                  )}
                  {taskSubtasks.length > 0 ? (
                    <div className="space-y-1">
                      {taskSubtasks.map((sub, index) => (
                         <div key={sub.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 group min-w-0">
                           <CircleToggle
                             completed={sub.completed}
                             onClick={() => toggleSubtask(sub.id)}
                             size="sm"
                           />
                           {editingSubtaskId === sub.id ? (
                             <input
                               autoFocus
                               className="text-xs bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5 min-w-0"
                               value={editingSubtaskText}
                               onChange={e => setEditingSubtaskText(e.target.value)}
                               onBlur={() => saveSubtaskEdit(sub.id)}
                               onKeyDown={e => e.key === 'Enter' && saveSubtaskEdit(sub.id)}
                             />
                           ) : (
                             <span
                               onClick={() => startEditing(sub)}
                               className={`text-xs cursor-text truncate ${sub.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                             >
                               {sub.text}
                             </span>
                           )}
                          <span className="text-xs text-muted-foreground shrink-0">{sub.durationMinutes || 0} min</span>
                          <button
                            onClick={() => deleteSubtask(sub.id)}
                            className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-center py-3 text-muted-foreground">No subtasks yet</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                      <input
                        value={newSubtaskText}
                        onChange={e => setNewSubtaskText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addSubtask()}
                        placeholder="Add sub-task"
                        className="flex-1 min-w-[120px] bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={newSubtaskDuration}
                        onChange={e => setNewSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                        placeholder="min"
                        className="w-16 bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
                      />
                      <button onClick={addSubtask} className="px-3 py-2 text-xs bg-foreground text-background rounded-lg shrink-0">Add</button>
                    </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 mb-6">
              <button
                onClick={() => setChecklistsCollapsed(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
                  {(focusChecklists.length + focusChecklistItems.length) > 0 && (
                    <span className="text-xs text-muted-foreground">({focusChecklists.length + focusChecklistItems.length})</span>
                  )}
                </div>
                {checklistsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
              </button>
              {!checklistsCollapsed && (
                <div className="border-t border-border/60 px-4 py-3 space-y-3">
                  {focusChecklists.length === 0 && focusChecklistItems.length === 0 && <p className="text-xs text-muted-foreground">No checklist yet. Add an item to create one.</p>}
                  {(focusChecklists.length > 0 || focusChecklistItems.length > 0) && (
                    <DragDropContext onDragEnd={handleDeepFocusReorder}>
                      {focusChecklists.length > 0 && (
                        <Droppable droppableId="deepfocus-checklist-lists">
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                              {focusChecklists.map((list, index) => {
                                const isCollapsed = collapsedDraftChecklists.has(list.id);
                                return (
                                  <Draggable key={list.id} draggableId={list.id} index={index}>
                                    {(provided) => (
                                      <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-xl border border-border bg-muted/20 overflow-hidden group/list">
                                        <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-all min-w-0">
                                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                            <GripVertical className="w-4 h-4" />
                                          </div>
                                          <div className="flex-1 flex items-center gap-2 min-w-0 pl-4">
                                            {editingDraftChecklistId === list.id ? (
                                              <input
                                                autoFocus
                                                className="flex-1 text-sm font-semibold text-foreground bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5 min-w-0"
                                                value={editingDraftChecklistTitle}
                                                onChange={e => setEditingDraftChecklistTitle(e.target.value)}
                                                onBlur={() => {
                                                  if (editingDraftChecklistTitle.trim()) {
                                                    updateTask(selectedTask.id, {
                                                      checklists: selectedTask.checklists.map(cl => cl.id === list.id ? { ...cl, title: editingDraftChecklistTitle.trim() } : cl),
                                                    });
                                                  }
                                                  setEditingDraftChecklistId(null);
                                                }}
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter') {
                                                    if (editingDraftChecklistTitle.trim()) {
                                                      updateTask(selectedTask.id, {
                                                        checklists: selectedTask.checklists.map(cl => cl.id === list.id ? { ...cl, title: editingDraftChecklistTitle.trim() } : cl),
                                                      });
                                                    }
                                                    setEditingDraftChecklistId(null);
                                                  }
                                                }}
                                              />
                                            ) : (
                                              <span onClick={(e) => { e.stopPropagation(); setEditingDraftChecklistId(list.id); setEditingDraftChecklistTitle(list.title); }} className="flex-1 text-sm font-semibold text-foreground cursor-text truncate">
                                                {list.title}
                                              </span>
                                            )}
                                            <span className="text-xs text-muted-foreground shrink-0">({list.items.length})</span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              onClick={() => updateTask(selectedTask.id, { checklists: selectedTask.checklists.filter(cl => cl.id !== list.id) })}
                                              className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/list:opacity-100 transition-all shrink-0"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => setCollapsedDraftChecklists(prev => { const next = new Set(prev); isCollapsed ? next.delete(list.id) : next.add(list.id); return next; })} className="p-1 text-muted-foreground hover:text-foreground shrink-0">
                                              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                                            </button>
                                          </div>
                                        </div>
                                        {!isCollapsed && (
                                          <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                                            <Droppable droppableId={`deepfocus-checklist-${list.id}`}>
                                              {(provided) => (
                                                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                                  {list.items.length === 0 && <p className="text-xs text-muted-foreground px-3 pb-1">No items yet</p>}
                                                  {list.items.map((item, idx) => (
                                                    <Draggable key={item.id} draggableId={item.id} index={idx}>
                                                      {(provided) => (
                                                        <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group min-w-0">
                                                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                                            <GripVertical className="w-4 h-4" />
                                                          </div>
                                                          <SquareToggle
                                                            completed={item.completed}
                                                            onClick={() => toggleChecklistItem(selectedTask.id, list.id, item.id)}
                                                            size="md"
                                                          />
                                                          {editingChecklistItemId === item.id ? (
                                                            <input
                                                              autoFocus
                                                              className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5 min-w-0"
                                                              value={editingChecklistItemText}
                                                              onChange={e => setEditingChecklistItemText(e.target.value)}
                                                              onBlur={() => saveChecklistItemEdit(list.id, item.id)}
                                                              onKeyDown={e => e.key === 'Enter' && saveChecklistItemEdit(list.id, item.id)}
                                                            />
                                                          ) : (
                                                            <span
                                                              onClick={(e) => { e.stopPropagation(); setEditingChecklistItemId(item.id); setEditingChecklistItemText(item.text); }}
                                                              className={`flex-1 cursor-text truncate ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                                            >
                                                              {item.text}
                                                            </span>
                                                          )}
                                                          <button
                                                            onClick={() => deleteChecklistItem(selectedTask.id, list.id, item.id)}
                                                            className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                                          >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                          </button>
                                                        </div>
                                                      )}
                                                    </Draggable>
                                                  ))}
                                                  {provided.placeholder}
                                                </div>
                                              )}
                                            </Droppable>
                                            <div className="flex gap-2 pt-1">
                                              <input
                                                value={perChecklistInput[list.id] ?? ''}
                                                onChange={e => setPerChecklistInput(prev => ({ ...prev, [list.id]: e.target.value }))}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNamedChecklistItem(list.id); } }}
                                                placeholder="Add item"
                                                className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-xs"
                                              />
                                              <button onClick={() => addNamedChecklistItem(list.id)} className="px-3 py-1.5 text-xs !bg-[#000] !text-white rounded-lg shrink-0">Add</button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      )}
                      {focusChecklists.length === 0 && focusChecklistItems.length > 0 && (
                        <Droppable droppableId="deepfocus-checklist">
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                              {focusChecklistItems.map((item, index) => (
                                <Draggable key={item.id} draggableId={item.id} index={index}>
                                  {(provided) => (
                                    <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group min-w-0">
                                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                        <GripVertical className="w-4 h-4" />
                                      </div>
                                      <SquareToggle
                                        completed={item.completed}
                                        onClick={() => toggleChecklistItem(selectedTask.id, item.checklistId, item.id)}
                                        size="md"
                                      />
                                      {editingChecklistItemId === item.id ? (
                                        <input
                                          autoFocus
                                          className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5 min-w-0"
                                          value={editingChecklistItemText}
                                          onChange={e => setEditingChecklistItemText(e.target.value)}
                                          onBlur={() => saveChecklistItemEdit(item.checklistId, item.id)}
                                          onKeyDown={e => e.key === 'Enter' && saveChecklistItemEdit(item.checklistId, item.id)}
                                        />
                                      ) : (
                                        <span
                                          onClick={(e) => { e.stopPropagation(); setEditingChecklistItemId(item.id); setEditingChecklistItemText(item.text); }}
                                          className={`flex-1 cursor-text truncate ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                        >
                                          {item.text}
                                        </span>
                                      )}
                                      <button
                                        onClick={() => deleteChecklistItem(selectedTask.id, item.checklistId, item.id)}
                                        className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      )}
                    </DragDropContext>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={newChecklistTitle}
                      onChange={e => setNewChecklistTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newChecklistTitle.trim()) { addNamedChecklist(); } }}
                      placeholder="New checklist name"
                      className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                    />
                    <button onClick={addNamedChecklist} disabled={!newChecklistTitle.trim()} className="px-4 py-2 text-xs font-semibold !bg-[#000] !text-white rounded-lg shrink-0">Add checklist</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleBackToCompletion}
                className="flex-1 py-2.5 px-4 text-sm font-medium border rounded-xl text-muted-foreground border-border hover:bg-muted transition-all"
              >
                Back
              </button>
              <button
                onClick={handleFinalComplete}
                className="flex-1 py-2.5 px-4 text-sm font-medium !bg-[#000] !text-white rounded-xl hover:opacity-90 transition-all"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="relative z-10 w-[95vw] sm:w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl bg-white border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Brain className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">Deep Focus Mode</h2>
              <p className="text-xs text-muted-foreground truncate">
                {selectedTask ? `Focusing on: ${selectedTask.title}` : 'Select a task to focus on'}
              </p>
            </div>
          </div>
          <button
            onClick={close}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-8 space-y-8 pb-24">
          <div className="flex flex-col items-center">
              <div className="relative w-36 sm:w-44 h-36 sm:h-44 mb-4">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 190 190">
                <circle
                  cx="95"
                  cy="95"
                  r={r}
                  stroke="currentColor"
                  strokeWidth="7"
                  fill="none"
                  className="text-muted/20"
                />
                <circle
                  cx="95"
                  cy="95"
                  r={r}
                  stroke="currentColor"
                  strokeWidth="7"
                  fill="none"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - progress / 100)}
                  strokeLinecap="round"
                  className="text-primary transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-3xl font-bold tabular-nums text-foreground">{Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
                <div className="text-xs mt-0.5 text-muted-foreground">{pillLabel}</div>
              </div>
            </div>

            <div className="relative flex gap-1.5 flex-wrap justify-center mb-3">
              {(['20', '30', '40', '60'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => selectPill(p)}
                  disabled={isRunning}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-50 ${
                    activePill === p
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {p} min
                </button>
              ))}
              <div className="relative">
                <button
                  onClick={() => selectPill('custom')}
                  disabled={isRunning}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-50 ${
                    activePill === 'custom'
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {activePill === 'custom' && customMinutes > 0 ? `${customMinutes} min` : 'Custom'}
                </button>

                {showCustomPopup && (
                  <div
                    ref={customPopupRef}
                    className="absolute top-full mt-2 right-0 bg-card border border-border rounded-xl shadow-xl p-4 z-20 w-48"
                  >
                    <p className="text-xs font-semibold mb-2 text-foreground">Custom duration</p>
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="number"
                        min="1"
                        max="240"
                        value={customInput}
                        onChange={e => setCustomInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveCustomDuration()}
                        placeholder="e.g. 92"
                        className="w-full px-2.5 py-1.5 bg-muted border border-border text-foreground rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        autoFocus
                      />
                      <span className="text-xs text-muted-foreground flex-shrink-0">min</span>
                    </div>
                    <button
                      onClick={saveCustomDuration}
                      className="w-full py-1.5 !bg-[#000] !text-white text-xs font-medium rounded-lg hover:opacity-90 transition-all"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <hr className="border-t border-border/60" />

          {selectedTask && (
            <div className="space-y-7">
              <div className="space-y-3">
                <button
                  onClick={toggleSound}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                    soundEnabled
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  {soundEnabled ? 'Sound On' : 'Sound Off'}
                </button>

                {soundEnabled && showSoundPicker && (
                  <div className="flex gap-2 flex-wrap">
                    {SOUND_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => selectSound(opt.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                          selectedSound === opt.id
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-8">
                {!isRunning ? (
                  <button
                    onClick={timeLeft < totalSecs && totalSecs > 0 && timeLeft > 0 ? handleResume : handleStartSession}
                    className="w-full py-3 !bg-[#000] !text-white rounded-xl font-semibold text-sm hover:opacity-90 flex items-center justify-center gap-2 transition-all"
                  >
                    <Play className="w-4 h-4" />
                    {timeLeft < totalSecs && timeLeft > 0 ? 'Resume Session' : 'Start Session'}
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="w-full py-3 bg-muted text-muted-foreground rounded-xl font-semibold text-sm hover:bg-muted/80 flex items-center justify-center gap-2 transition-all"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                )}
              </div>

              <hr className="border-t border-border/60" />

              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setSubtasksCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Sub-tasks</h3>
                    {taskSubtasks.length > 0 && (
                      <span className="text-xs text-muted-foreground">({taskSubtasks.length})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {taskDurMins > 0 && (
                      <span className={`text-xs font-medium ${
                        remainingMins > 0 ? 'text-muted-foreground' :
                        remainingMins < 0 ? 'text-orange-500' : 'text-label-green'
                      }`}>
                        {remainingMins > 0
                          ? `${remainingMins} mins left`
                          : remainingMins < 0
                          ? `Over by ${Math.abs(remainingMins)} mins`
                          : '0 mins left ✓'}
                      </span>
                    )}
                    {subtasksCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {!subtasksCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    {allSubtasksDone && (
                      <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
                        All sub-tasks are done ✓
                      </div>
                    )}
                    <DragDropContext onDragEnd={handleDeepFocusReorder}>
                      <Droppable droppableId="deepfocus-subtasks">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                            {taskSubtasks.map((sub, index) => (
                              <Draggable key={sub.id} draggableId={sub.id} index={index}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 group min-w-0">
                                    <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                    <CircleToggle
                                      completed={sub.completed}
                                      onClick={() => toggleSubtask(sub.id)}
                                      size="sm"
                                    />
                                      {editingSubtaskId === sub.id ? (
                                        <input
                                          autoFocus
                                          className="text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5 min-w-0"
                                          value={editingSubtaskText}
                                          onChange={e => setEditingSubtaskText(e.target.value)}
                                          onBlur={() => saveSubtaskEdit(sub.id)}
                                          onKeyDown={e => e.key === 'Enter' && saveSubtaskEdit(sub.id)}
                                        />
                                      ) : (
                                        <span
                                          onClick={() => startEditing(sub)}
                                          className={`text-sm cursor-text truncate ${sub.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                        >
                                          {sub.text}
                                        </span>
                                      )}
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                      <input
                                        type="number"
                                        min={0}
                                        className="w-12 text-xs bg-muted/40 border border-border rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                                        value={sub.durationMinutes || 0}
                                        onChange={e => updateSubtaskDuration(sub.id, Math.max(0, Number(e.target.value) || 0))}
                                      />
                                      <span className="text-[10px] text-muted-foreground">min</span>
                                      <button
                                        onClick={() => deleteSubtask(sub.id)}
                                        className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {taskSubtasks.length === 0 && (
                              <p className="text-xs text-center py-3 text-muted-foreground">No subtasks yet</p>
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
                      <input
                        value={newSubtaskText}
                        onChange={e => setNewSubtaskText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addSubtask()}
                        placeholder="Add sub-task"
                        className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={newSubtaskDuration}
                        onChange={e => setNewSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                        placeholder="min"
                        className="bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
                      />
                      <button onClick={addSubtask} className="px-3 py-2 text-xs bg-foreground text-background rounded-lg shrink-0">Add</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setChecklistsCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
                    {(focusChecklists.length + focusChecklistItems.length) > 0 && (
                      <span className="text-xs text-muted-foreground">({focusChecklists.length + focusChecklistItems.length})</span>
                    )}
                  </div>
                  {checklistsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!checklistsCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    {focusChecklists.length === 0 && focusChecklistItems.length === 0 && <p className="text-xs text-muted-foreground">No checklist yet. Add an item to create one.</p>}
                    {(focusChecklists.length > 0 || focusChecklistItems.length > 0) && (
                      <DragDropContext onDragEnd={handleDeepFocusReorder}>
                        {focusChecklists.length > 0 && (
                          <Droppable droppableId="deepfocus-checklist-lists">
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                                {focusChecklists.map((list, index) => {
                                  const isCollapsed = collapsedDraftChecklists.has(list.id);
                                  return (
                                    <Draggable key={list.id} draggableId={list.id} index={index}>
                                      {(provided) => (
                                      <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-xl border border-border bg-muted/20 overflow-hidden group/list">
                                        <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-all min-w-0">
                                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                            <GripVertical className="w-4 h-4" />
                                          </div>
                                          <button
                                            onClick={() => setCollapsedDraftChecklists(prev => { const next = new Set(prev); isCollapsed ? next.delete(list.id) : next.add(list.id); return next; })}
                                            className="flex-1 flex items-center gap-2 text-left min-w-0 pl-4"
                                          >
                                            {editingDraftChecklistId === list.id ? (
                                              <input
                                                autoFocus
                                                className="flex-1 text-sm font-semibold text-foreground bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5 min-w-0"
                                                value={editingDraftChecklistTitle}
                                                onChange={e => setEditingDraftChecklistTitle(e.target.value)}
                                                onBlur={() => {
                                                  if (editingDraftChecklistTitle.trim()) {
                                                    updateTask(selectedTask.id, {
                                                      checklists: selectedTask.checklists.map(cl => cl.id === list.id ? { ...cl, title: editingDraftChecklistTitle.trim() } : cl),
                                                    });
                                                  }
                                                  setEditingDraftChecklistId(null);
                                                }}
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter') {
                                                    if (editingDraftChecklistTitle.trim()) {
                                                      updateTask(selectedTask.id, {
                                                        checklists: selectedTask.checklists.map(cl => cl.id === list.id ? { ...cl, title: editingDraftChecklistTitle.trim() } : cl),
                                                      });
                                                    }
                                                    setEditingDraftChecklistId(null);
                                                  }
                                                }}
                                              />
                                            ) : (
                                              <span onClick={(e) => { e.stopPropagation(); setEditingDraftChecklistId(list.id); setEditingDraftChecklistTitle(list.title); }} className="flex-1 text-sm font-semibold text-foreground cursor-text truncate">
                                                {list.title}
                                              </span>
                                            )}
                                            <span className="text-xs text-muted-foreground shrink-0">({list.items.length})</span>
                                          </button>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => updateTask(selectedTask.id, { checklists: selectedTask.checklists.filter(cl => cl.id !== list.id) })}
                                                className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/list:opacity-100 transition-all shrink-0"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                              <button onClick={() => setCollapsedDraftChecklists(prev => { const next = new Set(prev); isCollapsed ? next.delete(list.id) : next.add(list.id); return next; })} className="p-1 text-muted-foreground hover:text-foreground shrink-0">
                                                {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                                              </button>
                                            </div>
                                          </div>
                                          {!isCollapsed && (
                                            <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                                              <Droppable droppableId={`deepfocus-checklist-${list.id}`}>
                                                {(provided) => (
                                                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                                    {list.items.length === 0 && <p className="text-xs text-muted-foreground px-3 pb-1">No items yet</p>}
                                                    {list.items.map((item, idx) => (
                                                      <Draggable key={item.id} draggableId={item.id} index={idx}>
                                                        {(provided) => (
                                                          <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group min-w-0">
                                                            <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                                              <GripVertical className="w-4 h-4" />
                                                            </div>
                                                            <SquareToggle
                                                              completed={item.completed}
                                                              onClick={() => toggleChecklistItem(selectedTask.id, list.id, item.id)}
                                                              size="md"
                                                            />
                                                            {editingChecklistItemId === item.id ? (
                                                              <input
                                                                autoFocus
                                                                className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5 min-w-0"
                                                                value={editingChecklistItemText}
                                                                onChange={e => setEditingChecklistItemText(e.target.value)}
                                                                onBlur={() => saveChecklistItemEdit(list.id, item.id)}
                                                                onKeyDown={e => e.key === 'Enter' && saveChecklistItemEdit(list.id, item.id)}
                                                              />
                                                            ) : (
                                                              <span
                                                                onClick={(e) => { e.stopPropagation(); setEditingChecklistItemId(item.id); setEditingChecklistItemText(item.text); }}
                                                                className={`flex-1 cursor-text truncate ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                                              >
                                                                {item.text}
                                                              </span>
                                                            )}
                                                            <button
                                                              onClick={() => deleteChecklistItem(selectedTask.id, list.id, item.id)}
                                                              className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                                            >
                                                              <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                          </div>
                                                        )}
                                                      </Draggable>
                                                    ))}
                                                    {provided.placeholder}
                                                  </div>
                                                )}
                                              </Droppable>
                                              <div className="flex gap-2 pt-1">
                                                <input
                                                  value={perChecklistInput[list.id] ?? ''}
                                                  onChange={e => setPerChecklistInput(prev => ({ ...prev, [list.id]: e.target.value }))}
                                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNamedChecklistItem(list.id); } }}
                                                  placeholder="Add item"
                                                  className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-xs"
                                                />
                                                <button onClick={() => addNamedChecklistItem(list.id)} className="px-3 py-1.5 text-xs !bg-[#000] !text-white rounded-lg shrink-0">Add</button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </Draggable>
                                  );
                                })}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        )}
                        {focusChecklists.length === 0 && focusChecklistItems.length > 0 && (
                          <Droppable droppableId="deepfocus-checklist">
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                {focusChecklistItems.map((item, index) => (
                                  <Draggable key={item.id} draggableId={item.id} index={index}>
                                    {(provided) => (
                                      <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group min-w-0">
                                        <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                          <GripVertical className="w-4 h-4" />
                                        </div>
                                        <SquareToggle
                                          completed={item.completed}
                                          onClick={() => toggleChecklistItem(selectedTask.id, item.checklistId, item.id)}
                                          size="md"
                                        />
                                        {editingChecklistItemId === item.id ? (
                                          <input
                                            autoFocus
                                            className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5 min-w-0"
                                            value={editingChecklistItemText}
                                            onChange={e => setEditingChecklistItemText(e.target.value)}
                                            onBlur={() => saveChecklistItemEdit(item.checklistId, item.id)}
                                            onKeyDown={e => e.key === 'Enter' && saveChecklistItemEdit(item.checklistId, item.id)}
                                          />
                                        ) : (
                                          <span
                                            onClick={(e) => { e.stopPropagation(); setEditingChecklistItemId(item.id); setEditingChecklistItemText(item.text); }}
                                            className={`flex-1 cursor-text truncate ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                          >
                                            {item.text}
                                          </span>
                                        )}
                                        <button
                                          onClick={() => deleteChecklistItem(selectedTask.id, item.checklistId, item.id)}
                                          className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        )}
                      </DragDropContext>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={newChecklistTitle}
                        onChange={e => setNewChecklistTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newChecklistTitle.trim()) { addNamedChecklist(); } }}
                        placeholder="New checklist name"
                        className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                      />
                      <button onClick={addNamedChecklist} disabled={!newChecklistTitle.trim()} className="px-4 py-2 text-xs font-semibold !bg-[#000] !text-white rounded-lg shrink-0">Add checklist</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setAttachmentsCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
                    {(selectedTask.attachments?.length ?? 0) > 0 && (
                      <span className="text-xs text-muted-foreground">({(selectedTask.attachments ?? []).length})</span>
                    )}
                  </div>
                  {attachmentsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!attachmentsCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                          <Paperclip className="w-5 h-5 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                        <p className="text-xs text-muted-foreground mt-1">PDF, Images, Documents (max 10MB)</p>
                      </div>
                      <input ref={fileInputRef} type="file" multiple onChange={handleFileUpload} className="hidden" />
                    </label>
                    {(selectedTask.attachments?.length ?? 0) > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(selectedTask.attachments || []).map((att: any) => (
                          <div key={att.id} className="relative group/att">
                            <a href={att.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-all">
                              <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center">
                                <Paperclip className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{att.fileName}</p>
                                <p className="text-xs text-muted-foreground">{att.fileSize ? `${(att.fileSize / 1024).toFixed(1)} KB` : 'Attached file'}</p>
                              </div>
                            </a>
                            <button
                              onClick={() => deleteAttachment(att.id)}
                              className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/att:opacity-100 transition-all shadow-sm"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setImagesCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Images</h3>
                    {(selectedTask.images?.length ?? 0) > 0 && (
                      <span className="text-xs text-muted-foreground">({(selectedTask.images ?? []).length})</span>
                    )}
                  </div>
                  {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!imagesCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                          <Image className="w-5 h-5 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Click to upload</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                      </div>
                      <input ref={imageInputRef} type="file" multiple onChange={handleImageUpload} accept="image/*,.heic,.heif" className="hidden" />
                    </label>
                    {(selectedTask.images?.length ?? 0) > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {(selectedTask.images || []).map((img: any) => (
                          <div key={img.id} className="relative aspect-square rounded-xl border border-border bg-muted/40 overflow-hidden group/img">
                            {img.fileUrl?.match(/^data:image/) ? (
                              <img src={img.fileUrl} alt={img.fileName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><Image className="w-6 h-6 text-muted-foreground" /></div>
                            )}
                            <button
                              onClick={() => deleteImage(img.id)}
                              className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all z-10 shadow-sm"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                              <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
                              {img.fileSize != null && <p className="text-[10px] text-white/70">{(img.fileSize / 1024).toFixed(1)} KB</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-muted/20">
            <button
              onClick={() => setProgressCollapsed(prev => !prev)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Today's Progress</h3>
              </div>
              {progressCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
            </button>
            {!progressCollapsed && (
              <div className="border-t border-border/60 px-4 py-3">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">{todayStats.sessions}</div>
                    <div className="text-xs text-muted-foreground">Sessions</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary">{todayStats.minutes}</div>
                    <div className="text-xs text-muted-foreground">Minutes</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepFocusMode;
