import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Megaphone,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Assignment {
  id: number;
  classroomId: number;
  title: string;
  description: string | null;
  dueDate: string | null;
  createdById: number;
}

interface Announcement {
  id: number;
  content: string;
  createdAt: string;
  authorId: number;
  authorName: string;
}

interface Classroom {
  id: number;
  teacherId: number;
  teacher: { id: number; name: string; email: string } | null;
  name: string;
  subject: string | null;
  description: string | null;
  joinCode: string;
  color: string;
  createdAt: string;
  role: 'teacher' | 'student' | null;
  memberCount: number;
  members: Member[];
  assignments: Assignment[];
  announcements: Announcement[];
}

interface Submission {
  id: number;
  assignmentId: number;
  studentId: number;
  studentName?: string;
  content: string | null;
  status: 'submitted' | 'graded';
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  assignmentTitle?: string;
}

type Tab = 'assignments' | 'submissions' | 'announcements' | 'members';

const api = async (url: string, options: RequestInit = {}) => {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

const formatShortDate = (value?: string | null) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatFullDate = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const COLOR_OPTIONS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

const ClassroomsPage: React.FC = () => {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Classroom | null>(null);
  const [tab, setTab] = useState<Tab>('assignments');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  // create form
  const [createName, setCreateName] = useState('');
  const [createSubject, setCreateSubject] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createColor, setCreateColor] = useState(COLOR_OPTIONS[0]);

  // assignment form
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentDue, setAssignmentDue] = useState('');

  // submission form
  const [submissionContent, setSubmissionContent] = useState('');
  const [submittingFor, setSubmittingFor] = useState<number | null>(null);

  // grading form
  const [gradeScore, setGradeScore] = useState<string>('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null);

  // announcement form
  const [announcementContent, setAnnouncementContent] = useState('');
  const [saving, setSaving] = useState(false);

  const loadClassrooms = useCallback(async () => {
    try {
      const data = await api('/api/classrooms');
      setClassrooms(data.classrooms || []);
      setSelected(prev => {
        if (!prev) return null;
        const updated = (data.classrooms || []).find((c: Classroom) => c.id === prev.id);
        return updated || null;
      });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to load classrooms', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSubmissions = useCallback(async (classroomId: number) => {
    try {
      const data = await api(`/api/classrooms/${classroomId}/submissions`);
      setSubmissions(data.submissions || []);
    } catch {
      setSubmissions([]);
    }
  }, []);

  useEffect(() => {
    loadClassrooms();
  }, [loadClassrooms]);

  useEffect(() => {
    if (selected && tab === 'submissions') loadSubmissions(selected.id);
  }, [selected, tab, loadSubmissions]);

  const openClassroom = async (id: number) => {
    setTab('assignments');
    setSelected(null);
    try {
      const data = await api(`/api/classrooms/${id}`);
      setSelected(data.classroom);
      setClassrooms(prev => prev.map(c => (c.id === id ? data.classroom : c)));
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to open classroom', variant: 'destructive' });
    }
  };

  const createClassroom = async () => {
    if (createName.trim().length < 2) {
      toast({ title: 'Error', description: 'Class name must be at least 2 characters', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = await api('/api/classrooms', {
        method: 'POST',
        body: JSON.stringify({ name: createName, subject: createSubject, description: createDescription, color: createColor }),
      });
      setClassrooms(prev => [data.classroom, ...prev]);
      setShowCreateModal(false);
      setCreateName('');
      setCreateSubject('');
      setCreateDescription('');
      setCreateColor(COLOR_OPTIONS[0]);
      toast({ title: 'Class created', description: `Share code ${data.classroom.joinCode} with your students` });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to create class', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const joinClassroom = async () => {
    if (!joinCode.trim()) {
      toast({ title: 'Error', description: 'Enter a join code', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = await api('/api/classrooms/join', {
        method: 'POST',
        body: JSON.stringify({ code: joinCode }),
      });
      setClassrooms(prev => [data.classroom, ...prev]);
      setShowJoinModal(false);
      setJoinCode('');
      setSelected(data.classroom);
      toast({ title: 'Joined', description: `You joined ${data.classroom.name}` });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to join class', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteClassroom = async (c: Classroom) => {
    if (!window.confirm(`Delete "${c.name}"? This removes all assignments and submissions.`)) return;
    try {
      await api(`/api/classrooms/${c.id}`, { method: 'DELETE' });
      setClassrooms(prev => prev.filter(x => x.id !== c.id));
      if (selected?.id === c.id) setSelected(null);
      toast({ title: 'Class deleted' });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete class', variant: 'destructive' });
    }
  };

  const leaveClassroom = async () => {
    if (!selected || !window.confirm(`Leave "${selected.name}"?`)) return;
    try {
      await api(`/api/classrooms/${selected.id}/leave`, { method: 'POST' });
      setClassrooms(prev => prev.filter(x => x.id !== selected.id));
      setSelected(null);
      toast({ title: 'Left class' });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to leave class', variant: 'destructive' });
    }
  };

  const removeMember = async (memberId: number) => {
    if (!selected || !window.confirm('Remove this student?')) return;
    try {
      await api(`/api/classrooms/${selected.id}/members/${memberId}`, { method: 'DELETE' });
      loadClassrooms();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to remove member', variant: 'destructive' });
    }
  };

  const createAssignment = async () => {
    if (!selected || assignmentTitle.trim().length === 0) {
      toast({ title: 'Error', description: 'Assignment title is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = await api(`/api/classrooms/${selected.id}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ title: assignmentTitle, description: assignmentDescription, dueDate: assignmentDue || null }),
      });
      setSelected(prev => prev ? { ...prev, assignments: [data.assignment, ...prev.assignments] } : prev);
      setAssignmentTitle('');
      setAssignmentDescription('');
      setAssignmentDue('');
      toast({ title: 'Assignment posted' });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to create assignment', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteAssignment = async (assignmentId: number) => {
    if (!selected || !window.confirm('Delete this assignment?')) return;
    try {
      await api(`/api/classrooms/${selected.id}/assignments/${assignmentId}`, { method: 'DELETE' });
      setSelected(prev => prev ? { ...prev, assignments: prev.assignments.filter(a => a.id !== assignmentId) } : prev);
      toast({ title: 'Assignment deleted' });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete assignment', variant: 'destructive' });
    }
  };

  const submitAssignment = async (assignmentId: number) => {
    if (!selected || submissionContent.trim().length === 0) {
      toast({ title: 'Error', description: 'Write something to submit', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api(`/api/classrooms/${selected.id}/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ content: submissionContent }),
      });
      setSubmissionContent('');
      setSubmittingFor(null);
      toast({ title: 'Submitted', description: 'Your work has been submitted' });
      loadSubmissions(selected.id);
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to submit', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const gradeSubmission = async () => {
    if (!selected || !gradingSubmission) return;
    const score = gradeScore.trim() === '' ? null : Number(gradeScore);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
      toast({ title: 'Error', description: 'Score must be between 0 and 100', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api(`/api/classrooms/${selected.id}/submissions/${gradingSubmission.id}/grade`, {
        method: 'POST',
        body: JSON.stringify({ score, feedback: gradeFeedback }),
      });
      setGradingSubmission(null);
      setGradeScore('');
      setGradeFeedback('');
      toast({ title: 'Graded' });
      loadSubmissions(selected.id);
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to grade', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const postAnnouncement = async () => {
    if (!selected || announcementContent.trim().length === 0) {
      toast({ title: 'Error', description: 'Write an announcement', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = await api(`/api/classrooms/${selected.id}/announcements`, {
        method: 'POST',
        body: JSON.stringify({ content: announcementContent }),
      });
      setSelected(prev => prev ? { ...prev, announcements: [{ ...data.announcement, authorName: user?.name || 'Teacher' }, ...prev.announcements] } : prev);
      setAnnouncementContent('');
      toast({ title: 'Announced' });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to post announcement', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async (announcementId: number) => {
    if (!selected || !window.confirm('Delete this announcement?')) return;
    try {
      await api(`/api/classrooms/${selected.id}/announcements/${announcementId}`, { method: 'DELETE' });
      setSelected(prev => prev ? { ...prev, announcements: prev.announcements.filter(a => a.id !== announcementId) } : prev);
      toast({ title: 'Announcement deleted' });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete announcement', variant: 'destructive' });
    }
  };

  const isTeacher = selected?.role === 'teacher';

  const mySubmissions = (assignmentId: number) => submissions.filter(s => s.assignmentId === assignmentId);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Classroom</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowJoinModal(true)}
            className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-muted transition-colors text-sm font-medium"
          >
            Join with code
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4 inline mr-1" />
            Create class
          </button>
        </div>
      </div>

      {selected ? (
        <div className="space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to all classes
          </button>

          {/* Class header */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center font-bold text-white" style={{ backgroundColor: selected.color }}>
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {[selected.subject, selected.teacher ? selected.teacher.name : null, `${selected.memberCount} member${selected.memberCount === 1 ? '' : 's'}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isTeacher && (
                  <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium flex items-center gap-1.5">
                    <Users className="w-4 h-4" /> Code: {selected.joinCode}
                  </span>
                )}
                {isTeacher ? (
                  <button
                    onClick={() => deleteClassroom(selected)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete class"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={leaveClassroom}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                  >
                    Leave
                  </button>
                )}
              </div>
            </div>
            {selected.description && (
              <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{selected.description}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-4">
              {([
                { id: 'assignments', label: 'Assignments', icon: ClipboardList },
                { id: 'submissions', label: 'Submissions', icon: CheckCircle2 },
                { id: 'announcements', label: 'Announcements', icon: Megaphone },
                { id: 'members', label: 'Members', icon: Users },
              ] as Array<{ id: Tab; label: string; icon: React.ElementType }>).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignments */}
          {tab === 'assignments' && (
            <div className="space-y-4">
              {isTeacher && (
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Post an assignment</h3>
                  <input
                    value={assignmentTitle}
                    onChange={e => setAssignmentTitle(e.target.value)}
                    placeholder="Assignment title"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                  />
                  <textarea
                    value={assignmentDescription}
                    onChange={e => setAssignmentDescription(e.target.value)}
                    placeholder="Instructions (optional)"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={assignmentDue}
                      onChange={e => setAssignmentDue(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                    />
                    <button
                      onClick={createAssignment}
                      disabled={saving}
                      className="ml-auto px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                    >
                      {saving ? 'Posting…' : 'Post'}
                    </button>
                  </div>
                </div>
              )}
              {selected.assignments.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                  {isTeacher ? 'No assignments yet. Post the first one above.' : 'No assignments yet.'}
                </div>
              ) : (
                selected.assignments.map(a => {
                  const mine = mySubmissions(a.id);
                  return (
                    <div key={a.id} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground">{a.title}</h4>
                          {a.description && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.description}</p>}
                          <p className="text-xs text-muted-foreground mt-2">
                            Due: {formatShortDate(a.dueDate)}
                            {mine.length > 0 && (
                              <span className="ml-2 text-label-green">
                                {mine[0].status === 'graded' ? `Graded: ${mine[0].score ?? '—'}/100` : 'Submitted'}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          {isTeacher ? (
                            <button
                              onClick={() => deleteAssignment(a.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Delete assignment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : mine.length > 0 ? (
                            mine[0].status === 'graded' && mine[0].feedback ? (
                              <p className="text-xs text-muted-foreground max-w-[200px] text-right">
                                Feedback: {mine[0].feedback}
                              </p>
                            ) : (
                              <span className="text-xs text-muted-foreground">Submitted {formatFullDate(mine[0].submittedAt)}</span>
                            )
                          ) : (
                            <button
                              onClick={() => setSubmittingFor(submittingFor === a.id ? null : a.id)}
                              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
                            >
                              Submit
                            </button>
                          )}
                        </div>
                      </div>
                      {!isTeacher && mine.length === 0 && submittingFor === a.id && (
                        <div className="mt-3 space-y-2 border-t border-border pt-3">
                          <textarea
                            value={submissionContent}
                            onChange={e => setSubmissionContent(e.target.value)}
                            placeholder="Your answer…"
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                          />
                          <button
                            onClick={() => submitAssignment(a.id)}
                            disabled={saving}
                            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                          >
                            {saving ? 'Submitting…' : 'Submit work'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Submissions */}
          {tab === 'submissions' && (
            <div className="space-y-4">
              {!isTeacher && submissions.length === 0 && (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                  You have not submitted anything yet.
                </div>
              )}
              {isTeacher && submissions.length === 0 && (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                  No submissions yet. Students can submit from the Assignments tab.
                </div>
              )}
              {submissions.map(s => (
                <div key={s.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {isTeacher && s.studentName ? `${s.studentName} · ` : ''}{s.assignmentTitle || `Assignment #${s.assignmentId}`}
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">Submitted {formatFullDate(s.submittedAt)}</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{s.content}</p>
                      {s.status === 'graded' && (
                        <p className="text-sm mt-2">
                          <span className="font-semibold text-label-green">Score: {s.score ?? '—'}/100</span>
                          {s.feedback && <span className="text-muted-foreground"> · {s.feedback}</span>}
                        </p>
                      )}
                    </div>
                    {isTeacher && (
                      <button
                        onClick={() => {
                          setGradingSubmission(s);
                          setGradeScore(s.score !== null ? String(s.score) : '');
                          setGradeFeedback(s.feedback || '');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 ${
                          s.status === 'graded'
                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {s.status === 'graded' ? 'Regrade' : 'Grade'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Announcements */}
          {tab === 'announcements' && (
            <div className="space-y-4">
              {isTeacher && (
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <textarea
                    value={announcementContent}
                    onChange={e => setAnnouncementContent(e.target.value)}
                    placeholder="Announce something to your class…"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                  />
                  <button
                    onClick={postAnnouncement}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? 'Posting…' : 'Post announcement'}
                  </button>
                </div>
              )}
              {selected.announcements.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                  No announcements yet.
                </div>
              ) : (
                selected.announcements.map(a => (
                  <div key={a.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <Megaphone className="w-3.5 h-3.5" />
                          <span className="font-medium text-foreground">{a.authorName}</span>
                          <span>·</span>
                          <span>{formatFullDate(a.createdAt)}</span>
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{a.content}</p>
                      </div>
                      {isTeacher && (
                        <button
                          onClick={() => deleteAnnouncement(a.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete announcement"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Members */}
          {tab === 'members' && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-foreground mb-2">Members ({selected.members.length})</h3>
              {selected.members.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                      {m.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {m.name} {m.id === user?.id && <span className="text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.email} · {m.role === 'teacher' ? 'Teacher' : 'Student'}
                      </p>
                    </div>
                  </div>
                  {isTeacher && m.role === 'student' && (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove student"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Class list */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classrooms.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 bg-card border border-border rounded-xl p-10 text-center">
              <GraduationCap className="w-10 h-10 text-primary mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-foreground mb-1">No classes yet</h2>
              <p className="text-sm text-muted-foreground mb-4">Create a class and share the join code, or join one with a code your teacher gave you.</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
              >
                Create your first class
              </button>
            </div>
          ) : (
            classrooms.map(c => (
              <button
                key={c.id}
                onClick={() => openClassroom(c.id)}
                className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: c.color }}>
                    <BookOpen className="w-4 h-4" />
                  </div>
                  {c.role === 'teacher' && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-primary/10 text-primary">
                      Teacher
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-foreground mt-3 group-hover:text-primary transition-colors">{c.name}</h3>
                {c.subject && <p className="text-sm text-muted-foreground">{c.subject}</p>}
                <p className="text-xs text-muted-foreground mt-2">
                  {c.memberCount} member{c.memberCount === 1 ? '' : 's'} · {c.assignments.length} assignment{c.assignments.length === 1 ? '' : 's'}
                </p>
              </button>
            ))
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Create a class</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder="Class name (e.g. Biology 11A)"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            />
            <input
              value={createSubject}
              onChange={e => setCreateSubject(e.target.value)}
              placeholder="Subject (optional)"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            />
            <textarea
              value={createDescription}
              onChange={e => setCreateDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            />
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map(color => (
                <button
                  key={color}
                  onClick={() => setCreateColor(color)}
                  className={`w-7 h-7 rounded-full transition-transform ${createColor === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Color ${color}`}
                />
              ))}
            </div>
            <button
              onClick={createClassroom}
              disabled={saving}
              className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create class'}
            </button>
          </div>
        </div>
      )}

      {/* Join modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowJoinModal(false)} />
          <div className="relative bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Join a class</h3>
              <button onClick={() => setShowJoinModal(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">Enter the 6-character code your teacher shared.</p>
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. 7KQX2M"
              maxLength={6}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm tracking-[0.3em] font-mono text-center text-lg"
            />
            <button
              onClick={joinClassroom}
              disabled={saving}
              className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Joining…' : 'Join class'}
            </button>
          </div>
        </div>
      )}

      {/* Grade modal */}
      {gradingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setGradingSubmission(null)} />
          <div className="relative bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Grade submission</h3>
              <button onClick={() => setGradingSubmission(null)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap border border-border rounded-lg p-3 bg-background max-h-40 overflow-y-auto">
              {gradingSubmission.content}
            </p>
            <input
              inputMode="numeric"
              value={gradeScore}
              onChange={e => setGradeScore(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Score (0–100)"
              maxLength={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            />
            <textarea
              value={gradeFeedback}
              onChange={e => setGradeFeedback(e.target.value)}
              placeholder="Feedback (optional)"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            />
            <button
              onClick={gradeSubmission}
              disabled={saving}
              className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : gradingSubmission.status === 'graded' ? 'Save grade' : 'Submit grade'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassroomsPage;