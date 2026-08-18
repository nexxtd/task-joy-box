import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { classrooms, classroomMembers, classroomAssignments, assignmentSubmissions, classroomAnnouncements, users } from '../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

function generateJoinCode(): string {
  // 6-character code from unambiguous characters (no 0/O, 1/I/L)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6)).map(b => alphabet[b % alphabet.length]).join('');
}

async function getMembership(classroomId: number, userId: number) {
  const [membership] = await db.select().from(classroomMembers)
    .where(and(eq(classroomMembers.classroomId, classroomId), eq(classroomMembers.userId, userId)))
    .limit(1);
  return membership;
}

async function serializeClassroom(classroomId: number, viewerId: number) {
  const [classroom] = await db.select().from(classrooms).where(eq(classrooms.id, classroomId)).limit(1);
  if (!classroom) return null;

  const [teacher] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users).where(eq(users.id, classroom.teacherId)).limit(1);

  const memberRows = await db.select({
    id: users.id, name: users.name, email: users.email, role: classroomMembers.role, joinedAt: classroomMembers.joinedAt,
  })
    .from(classroomMembers)
    .innerJoin(users, eq(users.id, classroomMembers.userId))
    .where(eq(classroomMembers.classroomId, classroomId))
    .orderBy(classroomMembers.joinedAt);

  const assignments = await db.select().from(classroomAssignments)
    .where(eq(classroomAssignments.classroomId, classroomId))
    .orderBy(desc(classroomAssignments.createdAt));

  const announcements = await db.select({
    id: classroomAnnouncements.id,
    content: classroomAnnouncements.content,
    createdAt: classroomAnnouncements.createdAt,
    authorId: classroomAnnouncements.authorId,
    authorName: users.name,
  })
    .from(classroomAnnouncements)
    .innerJoin(users, eq(users.id, classroomAnnouncements.authorId))
    .where(eq(classroomAnnouncements.classroomId, classroomId))
    .orderBy(desc(classroomAnnouncements.createdAt));

  const membership = await getMembership(classroomId, viewerId);
  const role = membership?.role ?? (classroom.teacherId === viewerId ? 'teacher' : null);

  return {
    ...classroom,
    teacher: teacher ? { id: teacher.id, name: teacher.name, email: teacher.email } : null,
    role,
    memberCount: memberRows.length,
    members: memberRows.map(m => ({ id: m.id, name: m.name, email: m.email, role: m.role, joinedAt: m.joinedAt })),
    assignments,
    announcements,
  };
}

// --- List my classrooms (as teacher or student) ---
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const owned = await db.select().from(classrooms).where(eq(classrooms.teacherId, req.userId!)).orderBy(desc(classrooms.createdAt));
    const joined = await db.select().from(classroomMembers)
      .innerJoin(classrooms, eq(classrooms.id, classroomMembers.classroomId))
      .where(and(eq(classroomMembers.userId, req.userId!), eq(classroomMembers.role, 'student')))
      .orderBy(desc(classrooms.createdAt));

    const results = [];
    for (const c of owned) {
      const serialized = await serializeClassroom(c.id, req.userId!);
      if (serialized) results.push(serialized);
    }
    for (const j of joined) {
      const serialized = await serializeClassroom(j.classrooms.id, req.userId!);
      if (serialized) results.push(serialized);
    }
    res.json({ classrooms: results });
  } catch (error) {
    console.error('List classrooms error:', error);
    res.status(500).json({ error: 'Failed to list classrooms' });
  }
});

// --- Create classroom (any user can be a teacher) ---
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, subject, description, color } = req.body;
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Class name must be at least 2 characters' });
    }

    const [classroom] = await db.insert(classrooms).values({
      teacherId: req.userId!,
      name: String(name).trim().slice(0, 100),
      subject: subject ? String(subject).trim().slice(0, 100) : null,
      description: description ? String(description).trim().slice(0, 2000) : null,
      color: String(color || '#3b82f6'),
      joinCode: generateJoinCode(),
    }).returning();

    await db.insert(classroomMembers).values({
      classroomId: classroom.id,
      userId: req.userId!,
      role: 'teacher',
    });

    const serialized = await serializeClassroom(classroom.id, req.userId!);
    res.status(201).json({ classroom: serialized });
  } catch (error) {
    console.error('Create classroom error:', error);
    res.status(500).json({ error: 'Failed to create classroom' });
  }
});

// --- Join classroom via code ---
router.post('/join', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Join code is required' });

    const [classroom] = await db.select().from(classrooms).where(eq(classrooms.joinCode, code)).limit(1);
    if (!classroom) return res.status(404).json({ error: 'No class found with that code' });

    if (classroom.teacherId === req.userId!) {
      return res.status(400).json({ error: 'You are the teacher of this class' });
    }

    const existing = await getMembership(classroom.id, req.userId!);
    if (existing) return res.status(400).json({ error: 'You are already in this class' });

    await db.insert(classroomMembers).values({
      classroomId: classroom.id,
      userId: req.userId!,
      role: 'student',
    });

    const serialized = await serializeClassroom(classroom.id, req.userId!);
    res.json({ classroom: serialized });
  } catch (error) {
    console.error('Join classroom error:', error);
    res.status(500).json({ error: 'Failed to join classroom' });
  }
});

// --- Classroom detail ---
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership) return res.status(403).json({ error: 'Access denied' });

    const serialized = await serializeClassroom(id, req.userId!);
    if (!serialized) return res.status(404).json({ error: 'Classroom not found' });
    res.json({ classroom: serialized });
  } catch (error) {
    console.error('Get classroom error:', error);
    res.status(500).json({ error: 'Failed to get classroom' });
  }
});

// --- Update classroom (teacher only) ---
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership || membership.role !== 'teacher') return res.status(403).json({ error: 'Only the teacher can edit this class' });

    const { name, subject, description, color } = req.body;
    const updates: Record<string, string> = {};
    if (name !== undefined) updates.name = String(name).trim().slice(0, 100);
    if (subject !== undefined) updates.subject = String(subject).trim().slice(0, 100);
    if (description !== undefined) updates.description = String(description).trim().slice(0, 2000);
    if (color !== undefined) updates.color = String(color);

    if (Object.keys(updates).length > 0) {
      await db.update(classrooms).set(updates).where(eq(classrooms.id, id));
    }

    const serialized = await serializeClassroom(id, req.userId!);
    res.json({ classroom: serialized });
  } catch (error) {
    console.error('Update classroom error:', error);
    res.status(500).json({ error: 'Failed to update classroom' });
  }
});

// --- Delete classroom (teacher only) ---
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership || membership.role !== 'teacher') return res.status(403).json({ error: 'Only the teacher can delete this class' });

    await db.delete(classrooms).where(eq(classrooms.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete classroom error:', error);
    res.status(500).json({ error: 'Failed to delete classroom' });
  }
});

// --- Leave classroom (students) ---
router.post('/:id/leave', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership) return res.status(403).json({ error: 'Access denied' });
    if (membership.role === 'teacher') return res.status(400).json({ error: 'Teachers cannot leave — delete the class instead' });

    await db.delete(classroomMembers)
      .where(and(eq(classroomMembers.classroomId, id), eq(classroomMembers.userId, req.userId!)));
    res.json({ success: true });
  } catch (error) {
    console.error('Leave classroom error:', error);
    res.status(500).json({ error: 'Failed to leave classroom' });
  }
});

// --- Remove a student (teacher only) ---
router.delete('/:id/members/:memberId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const memberId = parseInt(req.params.memberId, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership || membership.role !== 'teacher') return res.status(403).json({ error: 'Only the teacher can remove members' });

    if (memberId === req.userId!) return res.status(400).json({ error: 'Teachers cannot remove themselves' });

    await db.delete(classroomMembers)
      .where(and(eq(classroomMembers.classroomId, id), eq(classroomMembers.userId, memberId)));
    res.json({ success: true });
  } catch (error) {
    console.error('Remove classroom member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// --- Assignments ---
router.post('/:id/assignments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership || membership.role !== 'teacher') return res.status(403).json({ error: 'Only the teacher can create assignments' });

    const { title, description, dueDate } = req.body;
    if (!title || String(title).trim().length === 0) return res.status(400).json({ error: 'Assignment title is required' });

    const [assignment] = await db.insert(classroomAssignments).values({
      classroomId: id,
      title: String(title).trim().slice(0, 200),
      description: description ? String(description).trim().slice(0, 5000) : null,
      dueDate: dueDate ? String(dueDate).slice(0, 20) : null,
      createdById: req.userId!,
    }).returning();

    res.status(201).json({ assignment });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

router.patch('/:id/assignments/:assignmentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership || membership.role !== 'teacher') return res.status(403).json({ error: 'Only the teacher can edit assignments' });

    const { title, description, dueDate } = req.body;
    const updates: Record<string, string> = {};
    if (title !== undefined) updates.title = String(title).trim().slice(0, 200);
    if (description !== undefined) updates.description = String(description).trim().slice(0, 5000);
    if (dueDate !== undefined) updates.dueDate = String(dueDate).slice(0, 20);

    if (Object.keys(updates).length > 0) {
      await db.update(classroomAssignments).set(updates)
        .where(and(eq(classroomAssignments.id, assignmentId), eq(classroomAssignments.classroomId, id)));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

router.delete('/:id/assignments/:assignmentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership || membership.role !== 'teacher') return res.status(403).json({ error: 'Only the teacher can delete assignments' });

    await db.delete(classroomAssignments)
      .where(and(eq(classroomAssignments.id, assignmentId), eq(classroomAssignments.classroomId, id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

// --- Submissions ---
// Student: get my submissions for this class (or all submissions if teacher)
router.get('/:id/submissions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership) return res.status(403).json({ error: 'Access denied' });

    let rows;
    if (membership.role === 'teacher') {
      rows = await db.select({
        id: assignmentSubmissions.id,
        assignmentId: assignmentSubmissions.assignmentId,
        studentId: assignmentSubmissions.studentId,
        studentName: users.name,
        content: assignmentSubmissions.content,
        status: assignmentSubmissions.status,
        score: assignmentSubmissions.score,
        feedback: assignmentSubmissions.feedback,
        submittedAt: assignmentSubmissions.submittedAt,
        assignmentTitle: classroomAssignments.title,
      })
        .from(assignmentSubmissions)
        .innerJoin(classroomAssignments, eq(classroomAssignments.id, assignmentSubmissions.assignmentId))
        .innerJoin(users, eq(users.id, assignmentSubmissions.studentId))
        .where(eq(classroomAssignments.classroomId, id))
        .orderBy(desc(assignmentSubmissions.submittedAt));
    } else {
      rows = await db.select({
        id: assignmentSubmissions.id,
        assignmentId: assignmentSubmissions.assignmentId,
        studentId: assignmentSubmissions.studentId,
        content: assignmentSubmissions.content,
        status: assignmentSubmissions.status,
        score: assignmentSubmissions.score,
        feedback: assignmentSubmissions.feedback,
        submittedAt: assignmentSubmissions.submittedAt,
      })
        .from(assignmentSubmissions)
        .where(and(eq(assignmentSubmissions.studentId, req.userId!), eq(classroomAssignments.classroomId, id)))
        .innerJoin(classroomAssignments, eq(classroomAssignments.id, assignmentSubmissions.assignmentId));
    }

    res.json({ submissions: rows });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Failed to get submissions' });
  }
});

// Student: submit / update submission for an assignment
router.post('/:id/assignments/:assignmentId/submit', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership) return res.status(403).json({ error: 'Access denied' });
    if (membership.role === 'teacher') return res.status(400).json({ error: 'Teachers cannot submit assignments' });

    const { content } = req.body;
    if (!content || String(content).trim().length === 0) return res.status(400).json({ error: 'Submission content is required' });

    const [assignment] = await db.select().from(classroomAssignments)
      .where(and(eq(classroomAssignments.id, assignmentId), eq(classroomAssignments.classroomId, id)))
      .limit(1);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const existing = await db.select().from(assignmentSubmissions)
      .where(and(eq(assignmentSubmissions.assignmentId, assignmentId), eq(assignmentSubmissions.studentId, req.userId!)))
      .limit(1);

    if (existing.length > 0) {
      const [submission] = await db.update(assignmentSubmissions)
        .set({ content: String(content).trim().slice(0, 10000), submittedAt: new Date().toISOString() })
        .where(eq(assignmentSubmissions.id, existing[0].id))
        .returning();
      return res.json({ submission });
    }

    const [submission] = await db.insert(assignmentSubmissions).values({
      assignmentId,
      studentId: req.userId!,
      content: String(content).trim().slice(0, 10000),
    }).returning();

    res.status(201).json({ submission });
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({ error: 'Failed to submit assignment' });
  }
});

// Teacher: grade a submission
router.post('/:id/submissions/:submissionId/grade', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const submissionId = parseInt(req.params.submissionId, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership || membership.role !== 'teacher') return res.status(403).json({ error: 'Only the teacher can grade submissions' });

    const { score, feedback } = req.body;
    if (score !== undefined && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100)) {
      return res.status(400).json({ error: 'Score must be a number between 0 and 100' });
    }

    const [submission] = await db.select({ id: assignmentSubmissions.id, assignmentId: assignmentSubmissions.assignmentId })
      .from(assignmentSubmissions)
      .innerJoin(classroomAssignments, eq(classroomAssignments.id, assignmentSubmissions.assignmentId))
      .where(and(eq(assignmentSubmissions.id, submissionId), eq(classroomAssignments.classroomId, id)))
      .limit(1);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    await db.update(assignmentSubmissions)
      .set({
        score: score !== undefined ? Math.round(score) : null,
        feedback: feedback !== undefined ? String(feedback).trim().slice(0, 2000) : null,
        status: 'graded',
      })
      .where(eq(assignmentSubmissions.id, submissionId));

    res.json({ success: true });
  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(500).json({ error: 'Failed to grade submission' });
  }
});

// --- Announcements ---
router.post('/:id/announcements', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership || membership.role !== 'teacher') return res.status(403).json({ error: 'Only the teacher can post announcements' });

    const { content } = req.body;
    if (!content || String(content).trim().length === 0) return res.status(400).json({ error: 'Announcement content is required' });

    const [announcement] = await db.insert(classroomAnnouncements).values({
      classroomId: id,
      authorId: req.userId!,
      content: String(content).trim().slice(0, 5000),
    }).returning();

    res.status(201).json({ announcement });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Failed to post announcement' });
  }
});

router.delete('/:id/announcements/:announcementId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const announcementId = parseInt(req.params.announcementId, 10);
    const membership = await getMembership(id, req.userId!);
    if (!membership || membership.role !== 'teacher') return res.status(403).json({ error: 'Only the teacher can delete announcements' });

    await db.delete(classroomAnnouncements)
      .where(and(eq(classroomAnnouncements.id, announcementId), eq(classroomAnnouncements.classroomId, id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

export default router;
