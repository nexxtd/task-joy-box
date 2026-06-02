import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GripVertical, Plus, MoreHorizontal, Archive, Eye, Edit, Trash2, Settings, Users, Calendar, Flag } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Project {
  id: number;
  name: string;
  description: string;
  color: string;
  ownerId: number;
  inviteCode: string;
  archived: boolean;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  order: number;
}

interface ProjectMember {
  id: number;
  projectId: number;
  userId: number;
  role: string;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
}

interface Milestone {
  id: string;
  name: string;
  date: string;
  description?: string;
  projectId: number;
}

const Projects: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newProject, setNewProject] = useState<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'order'>>({ 
    name: '', 
    description: '', 
    color: '#3b82f6', 
    ownerId: 0, 
    inviteCode: '', 
    archived: false, 
    completed: false 
  });
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<number | null>(null);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [projectUsers, setProjectUsers] = useState<User[]>([]);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [newMilestone, setNewMilestone] = useState<Omit<Milestone, 'id'>>({ 
    name: '', 
    date: '', 
    description: '', 
    projectId: 0 
  });

  // Load projects
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch('/api/projects', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load projects');
        const data = await response.json();
        // Sort projects by order
        const sortedProjects = [...data.projects].sort((a: Project, b: Project) => a.order - b.order);
        setProjects(sortedProjects);
      } catch (error) {
        console.error('Error loading projects:', error);
        toast({ title: 'Error', description: 'Failed to load projects' });
      }
    };
    loadProjects();
  }, []);

  // Load users
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await fetch('/api/users', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load users');
        const data = await response.json();
        setUsers(data.users || []);
      } catch (error) {
        console.error('Error loading users:', error);
        toast({ title: 'Error', description: 'Failed to load users' });
      }
    };
    loadUsers();
  }, []);

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) return;
    
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...newProject,
          ownerId: user?.id,
          order: projects.length, // Set order to the end of the list
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setProjects([...projects, { ...data.project, order: projects.length }]);
        setNewProject({ 
          name: '', 
          description: '', 
          color: '#3b82f6', 
          ownerId: 0, 
          inviteCode: '', 
          archived: false, 
          completed: false 
        });
        setIsCreateModalOpen(false);
        toast({ title: 'Success', description: 'Project created successfully' });
      } else {
        throw new Error('Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      toast({ title: 'Error', description: 'Failed to create project' });
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject) return;
    
    try {
      const response = await fetch(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editingProject),
      });
      
      if (response.ok) {
        const data = await response.json();
        setProjects(projects.map(p => p.id === data.project.id ? data.project : p));
        setEditingProject(null);
        setIsEditModalOpen(false);
        toast({ title: 'Success', description: 'Project updated successfully' });
      } else {
        throw new Error('Failed to update project');
      }
    } catch (error) {
      console.error('Error updating project:', error);
      toast({ title: 'Error', description: 'Failed to update project' });
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    
    try {
      const response = await fetch(`/api/projects/${projectToDelete}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (response.ok) {
        setProjects(projects.filter(p => p.id !== projectToDelete));
        setProjectToDelete(null);
        setIsDeleteModalOpen(false);
        toast({ title: 'Success', description: 'Project deleted successfully' });
      } else {
        throw new Error('Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast({ title: 'Error', description: 'Failed to delete project' });
    }
  };

  const handleArchiveProject = async (projectId: number) => {
    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) return;
      
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ archived: !project.archived }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setProjects(projects.map(p => p.id === data.project.id ? data.project : p));
        toast({ title: 'Success', description: `Project ${data.project.archived ? 'archived' : 'unarchived'} successfully` });
      } else {
        throw new Error(`Failed to ${project.archived ? 'unarchive' : 'archive'} project`);
      }
    } catch (error) {
      console.error(`Error ${project.archived ? 'unarchiving' : 'archiving'} project:`, error);
      toast({ title: 'Error', description: `Failed to ${project.archived ? 'unarchive' : 'archive'} project` });
    }
  };

  const handleCompleteProject = async (projectId: number) => {
    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) return;
      
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ completed: !project.completed }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setProjects(projects.map(p => p.id === data.project.id ? data.project : p));
        toast({ title: 'Success', description: `Project ${data.project.completed ? 'completed' : 'marked incomplete'} successfully` });
      } else {
        throw new Error(`Failed to ${project.completed ? 'mark incomplete' : 'complete'} project`);
      }
    } catch (error) {
      console.error(`Error ${project.completed ? 'marking incomplete' : 'completing'} project:`, error);
      toast({ title: 'Error', description: `Failed to ${project.completed ? 'mark incomplete' : 'complete'} project` });
    }
  };

  const handleInviteMember = async () => {
    if (!selectedProject || !newInviteEmail) return;
    
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: newInviteEmail }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setNewInviteEmail('');
        setIsInviteModalOpen(false);
        toast({ title: 'Success', description: 'Member invited successfully' });
      } else {
        throw new Error('Failed to invite member');
      }
    } catch (error) {
      console.error('Error inviting member:', error);
      toast({ title: 'Error', description: 'Failed to invite member' });
    }
  };

  const handleLeaveProject = async (projectId: number) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/leave`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (response.ok) {
        setProjects(projects.filter(p => p.id !== projectId));
        toast({ title: 'Success', description: 'Left project successfully' });
      } else {
        throw new Error('Failed to leave project');
      }
    } catch (error) {
      console.error('Error leaving project:', error);
      toast({ title: 'Error', description: 'Failed to leave project' });
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: number) => {
    e.dataTransfer.setData("text/plain", id.toString());
    setDraggingId(id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: number) => {
    e.preventDefault();
    const draggedId = parseInt(e.dataTransfer.getData("text/plain"));
    
    if (draggedId === targetId) return;
    
    const draggedIndex = projects.findIndex(p => p.id === draggedId);
    const targetIndex = projects.findIndex(p => p.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Create a new array with the dragged item moved to the target position
    const newProjects = [...projects];
    const [draggedProject] = newProjects.splice(draggedIndex, 1);
    newProjects.splice(targetIndex, 0, draggedProject);
    
    // Update the order property for each project
    const reorderedProjects = newProjects.map((project, index) => ({
      ...project,
      order: index
    }));
    
    setProjects(reorderedProjects);
    setDraggingId(null);
    
    // Update the order on the server
    updateProjectOrder(reorderedProjects);
  };

  const updateProjectOrder = async (orderedProjects: Project[]) => {
    try {
      const response = await fetch('/api/projects/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projects: orderedProjects.map((p, index) => ({ id: p.id, order: index }))
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update project order');
      }
    } catch (error) {
      console.error('Error updating project order:', error);
      toast({ title: 'Error', description: 'Failed to update project order' });
    }
  };

  const handleAddMilestone = async () => {
    if (!selectedProject || !newMilestone.name.trim() || !newMilestone.date) return;
    
    const milestoneToAdd = {
      ...newMilestone,
      id: Math.random().toString(36).substring(2, 9), // Generate a temporary ID
      projectId: selectedProject.id
    };
    
    setMilestones([...milestones, milestoneToAdd as Milestone]);
    setNewMilestone({ name: '', date: '', description: '', projectId: 0 });
    setShowMilestoneForm(false);
    
    // In a real implementation, you would save to the backend here
    toast({ title: 'Success', description: 'Milestone added successfully' });
  };

  const filteredProjects = projects.filter(p => !p.archived && !p.completed);
  const archivedProjects = projects.filter(p => p.archived);
  const completedProjects = projects.filter(p => p.completed);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Projects</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {/* Active Projects */}
          <div className="mb-6">
            <div className="flex items-center justify-between px-2 py-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Projects</h3>
            </div>
            <div className="space-y-1">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, project.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, project.id)}
                  onClick={() => setSelectedProject(project)}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${
                    selectedProject?.id === project.id 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <GripVertical className="w-4 h-4 text-gray-400" />
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="truncate text-sm">{project.name}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Completed Projects */}
          <div className="mb-6">
            <div className="flex items-center justify-between px-2 py-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed Projects</h3>
            </div>
            <div className="space-y-1">
              {completedProjects.map(project => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, project.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, project.id)}
                  onClick={() => setSelectedProject(project)}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${
                    selectedProject?.id === project.id 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <GripVertical className="w-4 h-4 text-gray-400" />
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="truncate text-sm">{project.name}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Archived Projects */}
          <div>
            <div className="flex items-center justify-between px-2 py-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Archived Projects</h3>
            </div>
            <div className="space-y-1">
              {archivedProjects.map(project => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, project.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, project.id)}
                  onClick={() => setSelectedProject(project)}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${
                    selectedProject?.id === project.id 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <GripVertical className="w-4 h-4 text-gray-400" />
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="truncate text-sm">{project.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-2 border-t border-gray-200">
          <Button 
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </Button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {selectedProject ? (
          <Tabs defaultValue="home" className="flex-1 flex flex-col">
            <div className="border-b border-gray-200">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="home">Home</TabsTrigger>
                <TabsTrigger value="board">Board</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="home" className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">{selectedProject.name}</h1>
                    <p className="text-gray-600">{selectedProject.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditingProject(selectedProject) || setIsEditModalOpen(true)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    {user?.id === selectedProject.ownerId ? (
                      <Button variant="outline" onClick={() => setIsMemberModalOpen(true)}>
                        <Users className="w-4 h-4 mr-2" />
                        Members
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => handleLeaveProject(selectedProject.id)}>
                        Leave Project
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Progress Overview */}
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>Progress Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                          <span className="text-sm font-medium text-gray-700">45%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: '45%' }}></div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="text-2xl font-bold">24</div>
                          <div className="text-sm text-gray-600">Total Tasks</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="text-2xl font-bold">11</div>
                          <div className="text-sm text-gray-600">Completed</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="text-2xl font-bold">13</div>
                          <div className="text-sm text-gray-600">Remaining</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Milestones */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Milestones</CardTitle>
                    <Button onClick={() => setShowMilestoneForm(!showMilestoneForm)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Milestone
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {showMilestoneForm && (
                      <div className="mb-4 p-4 border rounded-lg">
                        <div className="space-y-3">
                          <Input
                            placeholder="Milestone name"
                            value={newMilestone.name}
                            onChange={(e) => setNewMilestone({...newMilestone, name: e.target.value})}
                          />
                          <Input
                            type="date"
                            value={newMilestone.date}
                            onChange={(e) => setNewMilestone({...newMilestone, date: e.target.value})}
                          />
                          <textarea
                            placeholder="Description (optional)"
                            value={newMilestone.description}
                            onChange={(e) => setNewMilestone({...newMilestone, description: e.target.value})}
                            className="w-full p-2 border rounded"
                            rows={2}
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowMilestoneForm(false)}>Cancel</Button>
                            <Button onClick={handleAddMilestone}>Add Milestone</Button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {milestones.filter(m => m.projectId === selectedProject.id).length > 0 ? (
                      <div className="space-y-3">
                        {milestones
                          .filter(m => m.projectId === selectedProject.id)
                          .map(milestone => (
                            <div key={milestone.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <div className="font-medium">{milestone.name}</div>
                                <div className="text-sm text-gray-600">
                                  {new Date(milestone.date).toLocaleDateString()} {milestone.description && `- ${milestone.description}`}
                                </div>
                              </div>
                              <Badge variant="outline">
                                {new Date(milestone.date) < new Date() ? 'Past' : 'Upcoming'}
                              </Badge>
                            </div>
                          ))
                        }
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No milestones yet. Add your first milestone.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="board" className="flex-1 overflow-y-auto p-6">
              <div className="h-full">
                <iframe 
                  src={`/project-board?projectId=${selectedProject.id}`} 
                  className="w-full border-0"
                  style={{ minHeight: 'calc(100vh - 200px)' }}
                  title="Project Board"
                  onLoad={(e) => {
                    const iframe = e.target as HTMLIFrameElement;
                    iframe.style.height = `${iframe.contentWindow?.document.body.scrollHeight}px`;
                  }}
                />
              </div>
            </TabsContent>
            <TabsContent value="members" className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Project Members</h2>
                  {user?.id === selectedProject.ownerId && (
                    <Button onClick={() => setIsInviteModalOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Invite Member
                    </Button>
                  )}
                </div>
                
                <div className="space-y-4">
                  {/* Owner */}
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <Avatar>
                      <AvatarImage src={user?.avatarUrl} />
                      <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-medium">{user?.name}</div>
                      <div className="text-sm text-gray-600">{user?.email}</div>
                    </div>
                    <Badge variant="outline">Owner</Badge>
                  </div>
                  
                  {/* Other members */}
                  {projectMembers
                    .filter(member => member.projectId === selectedProject.id)
                    .map(member => {
                      const memberUser = projectUsers.find(u => u.id === member.userId);
                      return (
                        <div key={member.id} className="flex items-center gap-4 p-4 border rounded-lg">
                          <Avatar>
                            <AvatarImage src={memberUser?.avatarUrl} />
                            <AvatarFallback>{memberUser?.name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="font-medium">{memberUser?.name}</div>
                            <div className="text-sm text-gray-600">{memberUser?.email}</div>
                          </div>
                          <Badge variant="outline">{member.role}</Badge>
                        </div>
                      );
                    })}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          // Empty state when no project is selected
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Flag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Join or create a project to get started.</h2>
              <p className="text-gray-600 mb-6">Select a project from the sidebar or create a new one to begin.</p>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Create Project Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Project Name</label>
              <Input
                value={newProject.name}
                onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                placeholder="Enter project name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={newProject.description}
                onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                placeholder="Enter project description"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Color</label>
              <Input
                type="color"
                value={newProject.color}
                onChange={(e) => setNewProject({...newProject, color: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProject}>Create Project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Project Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Project Name</label>
              <Input
                value={editingProject?.name || ''}
                onChange={(e) => setEditingProject(editingProject ? {...editingProject, name: e.target.value} : null)}
                placeholder="Enter project name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={editingProject?.description || ''}
                onChange={(e) => setEditingProject(editingProject ? {...editingProject, description: e.target.value} : null)}
                placeholder="Enter project description"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Color</label>
              <Input
                type="color"
                value={editingProject?.color || ''}
                onChange={(e) => setEditingProject(editingProject ? {...editingProject, color: e.target.value} : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateProject}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this project? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProject}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Invite Member Modal */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Enter the email address of the person you'd like to invite to this project.</p>
            <Input
              value={newInviteEmail}
              onChange={(e) => setNewInviteEmail(e.target.value)}
              placeholder="Enter email address"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
            <Button onClick={handleInviteMember}>Send Invitation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Projects;