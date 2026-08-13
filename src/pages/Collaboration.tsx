import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Copy, Plus, Crown, Loader2, MessageCircle, Building2, Sparkles, ArrowRight, Users2, Home, CreditCard, DollarSign, Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Member';
}

interface Team {
  id: string;
  name: string;
  members: TeamMember[];
}

interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  members: TeamMember[];
  inviteCode: string;
  type: 'family' | 'organization'; // Removed 'personal'
  seatTier?: 'pro' | 'premium' | null;
  seatCount: number;
  billingStatus: 'free' | 'active' | 'past_due' | 'canceled';
  maxGroups: number;
  teams: Team[];
}

const Collaboration: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'team' | 'join' | 'chat'>('team'); // Removed 'workspace'
  const [joinCode, setJoinCode] = useState('');
  const [workspaceName, setWorkspaceName] = useState('My Workspace');
  const getFrontendUrl = () => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'https://task-joy-box.onrender.com';
  };
  const [inviteLink, setInviteLink] = useState(`${getFrontendUrl()}/join/XXXX-XXXX`);
  const [members, setMembers] = useState<TeamMember[]>([
    {
      id: String(user?.id || 'owner'),
      name: user?.name || 'Workspace Owner',
      email: user?.email || 'owner@example.com',
      role: 'Owner',
    },
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [joinedWorkspaceId, setJoinedWorkspaceId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'paypal'>('paypal');

  // Load user's workspace on component mount
  useEffect(() => {
    loadUserWorkspace();
  }, []);

  useEffect(() => {
    if (!joinedWorkspaceId) {
      setChatMessages([]);
      return;
    }
    loadChatMessages(joinedWorkspaceId);
  }, [joinedWorkspaceId]);

  const loadUserWorkspace = async () => {
    setIsLoading(true);
    try {
      // Try to get user's current workspace
      const response = await fetch('/api/workspace', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.workspace) {
          setWorkspace(data.workspace);
          setMembers(data.workspace.members);
          setTeams(data.workspace.teams || []);
          setWorkspaceName(data.workspace.name);
          setInviteLink(`${getFrontendUrl()}/join/${data.workspace.inviteCode}`);
          setJoinedWorkspaceId(data.workspace.id);
          setActiveTab('team');
        }
      }
    } catch (error) {
      console.error('Error loading workspace:', error);
      toast({ 
        title: 'Load Error', 
        description: 'Could not load workspace data. Using demo data.', 
        variant: 'destructive' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadChatMessages = async (workspaceId: string) => {
    try {
      const queryParams = selectedTeam ? `?groupId=${selectedTeam}` : '';
      const response = await fetch(`/api/collaboration/workspace/${workspaceId}/chat${queryParams}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setChatMessages(data.messages || []);
      } else {
        // Fallback to mock data if API fails
        setChatMessages([
          { id: 1, user: 'John Doe', message: 'Hi team, how are we doing with the project?', time: '10:30 AM' },
          { id: 2, user: 'Jane Smith', message: 'Making good progress on my tasks!', time: '10:32 AM' },
          { id: 3, user: 'Orel', message: 'I\'ve completed the design review', time: '10:35 AM' },
        ]);
      }
    } catch (error) {
      console.error('Error loading chat messages:', error);
      // Fallback to mock data
      setChatMessages([
        { id: 1, user: 'John Doe', message: 'Hi team, how are we doing with the project?', time: '10:30 AM' },
        { id: 2, user: 'Jane Smith', message: 'Making good progress on my tasks!', time: '10:32 AM' },
        { id: 3, user: 'Orel', message: 'I\'ve completed the design review', time: '10:35 AM' },
      ]);
    }
  };

  const loadWorkspaceWithMembers = async () => {
    const response = await fetch('/api/workspace', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.workspace) {
        setWorkspace(data.workspace);
        setMembers(data.workspace.members);
        setTeams(data.workspace.teams || []);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !joinedWorkspaceId) return;
    
    try {
      const response = await fetch(`/api/collaboration/workspace/${joinedWorkspaceId}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: newMessage,
          messageType: 'text',
          groupId: selectedTeam || undefined
        })
      });
      
      if (response.ok) {
        await response.json();
        const newMsg = {
          id: Date.now(),
          user: user?.name || 'Current User',
          message: newMessage,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages((prev) => [...prev, newMsg]);
        setNewMessage('');
      } else {
        toast({
          title: 'Error',
          description: 'Could not send message. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Could not send message. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast({ title: 'Copied', description: 'Invite link copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy invite link.', variant: 'destructive' });
    }
  };

  const handleInviteMember = async () => {
    const email = window.prompt('Enter teammate email');
    if (!email) return;
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      toast({ title: 'Invalid email', description: 'Please enter a valid email address.', variant: 'destructive' });
      return;
    }

    if (members.some((member) => member.email === normalized)) {
      toast({ title: 'Already invited', description: 'This member already exists.' });
      return;
    }

    try {
      // Call backend API to invite member
      const response = await fetch('/api/workspace/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          workspaceId: joinedWorkspaceId,
          email: normalized,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        loadWorkspaceWithMembers(); // Refresh the workspace data
        toast({ title: 'Member invited', description: `${normalized} has been added.` });
      } else if (response.status === 202) {
        // Pending invite for non-existing user
        toast({
          title: 'Invitation sent',
          description: data.note || `${normalized} will be added when they register.`,
        });
      } else if (response.status === 402 && data.error === 'SEAT_LIMIT_REACHED') {
        // Show seat limit dialog
        const shouldUpgrade = window.confirm(
          `You've used all ${data.usedSeats}/${data.currentSeats} seats. Add more seats to invite teammates.`
        );

        if (shouldUpgrade && workspace) {
          // Open checkout for one more seat
          const upgradeResponse = await fetch(`/api/workspace/workspace/${workspace.id}/billing/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              tier: workspace.seatTier || 'pro',
              seats: workspace.seatCount + 1
            }),
          });

          if (upgradeResponse.ok) {
            const { url } = await upgradeResponse.json();
            window.location.href = url;
          } else {
            toast({
              title: 'Checkout failed',
              description: 'Could not initiate checkout process',
              variant: 'destructive'
            });
          }
        }
      } else {
        toast({
          title: 'Invite failed',
          description: data.error || 'Could not invite member',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Network Error',
        description: 'Could not invite member. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleCreateWorkspace = async () => {
    const name = window.prompt('Enter workspace name:', 'My Workspace');
    if (!name || name.trim().length < 3) {
      toast({ title: 'Invalid name', description: 'Workspace name must be at least 3 characters.', variant: 'destructive' });
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          type: 'family'
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setWorkspace(data.workspace);
        setMembers(data.workspace.members);
        setTeams(data.workspace.teams || []);
        setWorkspaceName(data.workspace.name);
        setInviteLink(`${getFrontendUrl()}/join/${data.workspace.inviteCode}`);
        setJoinedWorkspaceId(data.workspace.id);
        toast({ title: 'Workspace created', description: `You created "${data.workspace.name}"` });
      } else if (response.status === 402 && data.error === 'UPGRADE_REQUIRED') {
        // Show upgrade prompt
        const shouldUpgrade = window.confirm(
          `Workspaces require a Premium subscription.\n\nCurrent tier: ${data.currentTier || 'Free'}\nRequired tier: Premium or higher\n\nClick OK to view pricing plans.`
        );
        if (shouldUpgrade) {
          window.location.href = '/pricing';
        }
      } else if (response.status === 402 && data.error === 'SUBSCRIPTION_INACTIVE') {
        toast({
          title: 'Subscription inactive',
          description: 'Your subscription is not active. Please renew to create workspaces.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Create failed', description: data.error || 'Could not create workspace', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Network Error', description: 'Could not create workspace. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinWorkspace = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
      toast({
        title: 'Invalid invite code',
        description: 'Use format XXXX-XXXX.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);
      // Call backend API to join workspace
      const response = await fetch('/api/collaboration/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });

      if (response.ok) {
        const data = await response.json();
        setWorkspaceName(data.workspace.name);
        setInviteLink(`${getFrontendUrl()}/join/${data.workspace.inviteCode}`);
        setJoinedWorkspaceId(data.workspace.id);
        setMembers(data.workspace.members);
        setTeams(data.workspace.teams || []);
        setActiveTab('team');
        toast({ title: 'Joined workspace', description: `You joined ${data.workspace.name}.` });
      } else {
        const data = await response.json();
        toast({ 
          title: 'Join failed', 
          description: data.error || 'Could not join workspace', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      toast({ 
        title: 'Network Error', 
        description: 'Could not join workspace. Please try again.', 
        variant: 'destructive' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addTeam = async () => {
    if (!newTeamName.trim() || !workspace) return;
    
    try {
      const response = await fetch(`/api/workspace/workspace/${workspace.id}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newTeamName.trim() }),
      });
      
      if (response.ok) {
        const { team } = await response.json();
        setTeams(prev => [...prev, team]);
        setNewTeamName('');
        toast({
          title: 'Team created',
          description: `Team "${team.name}" has been created successfully`,
        });
      } else {
        const data = await response.json();
        toast({
          title: 'Failed to create team',
          description: data.error || 'Could not create team',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Network Error',
        description: 'Could not create team. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleAddUserToTeam = async (teamId: string, userId: string) => {
    if (!window.confirm('Are you sure you want to add this user to the team?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/workspace/workspace/${joinedWorkspaceId}/group/${teamId}/add-member`, { // Keep the API route name as group for now
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      
      if (response.ok) {
        toast({ title: 'User added', description: 'User added to team successfully.' });
        loadWorkspaceWithMembers(); // Refresh workspace data
      } else {
        const data = await response.json();
        toast({ 
          title: 'Add user failed', 
          description: data.error || 'Could not add user to team', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      toast({ 
        title: 'Network Error', 
        description: 'Could not add user to team. Please try again.', 
        variant: 'destructive' 
      });
    }
  };

  const handleCheckout = async (tier: 'pro' | 'premium', seats: number) => {
    if (!workspace) return;
    
    try {
      const response = await fetch(`/api/workspace/workspace/${workspace.id}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier, seats }),
      });
      
      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        const data = await response.json();
        toast({
          title: 'Checkout failed',
          description: data.error || 'Could not initiate checkout process',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Network Error',
        description: 'Could not initiate checkout process. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Conditionally show the chat tab only if the user is in a team
  const tabs = [
    { id: 'team' as const, label: 'My Team' },
    ...(teams.length > 0 ? [{ id: 'chat' as const, label: 'Team Chat' }] : []), // Only show if user is in a team
    { id: 'join' as const, label: 'Join Workspace' },
  ];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading collaboration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="px-6 h-16 border-b border-border flex items-center">
        <h1 className="text-base font-bold text-foreground">Collaboration</h1>
      </header>

      {/* Tabs */}
      <div className="px-6 py-3 border-b border-border">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs rounded-md transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-card text-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {/* Informational banner about collaboration features */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-foreground">How to Use Collaboration</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Invite team members to your workspace using the "Invite Member" button. 
                Create teams to organize members and chat with them in real-time. 
                Free users have limited seats - upgrade to add more members to your workspace.
              </p>
            </div>
          </div>
        </div>

        {/* Paywall for free users - now as a non-blocking notice */}
        {!user?.subscriptionTier || user.subscriptionTier === 'free' ? (
          <div className="mb-6 p-4 bg-card border border-border rounded-xl text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Users2 className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground mb-2">Upgrade for Full Collaboration</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Work together with your team, share workspaces, and chat in real-time. 
              Premium and Pro plans allow unlimited members and advanced team features.
            </p>
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all duration-200"
            >
              <Sparkles className="w-4 h-4 fill-current" />
              View Pricing Plans
            </a>
          </div>
        ) : null}

        {activeTab === 'team' && (
          <div className="animate-fade-in space-y-6">
            {/* Create Workspace prompt for users without workspace */}
            {!joinedWorkspaceId && (
              <div className="bg-card border border-primary/20 rounded-xl p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-base font-semibold text-foreground mb-2">Create a Workspace</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  You need to create a workspace before you can invite team members.
                </p>
                <button
                  onClick={handleCreateWorkspace}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200 mx-auto"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Workspace
                </button>
              </div>
            )}

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">{workspaceName} Members</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleInviteMember}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200 disabled:opacity-50"
                    disabled={!joinedWorkspaceId}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Invite Member
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-primary">
                      {member.role === 'Owner' ? <Crown className="w-3.5 h-3.5" /> : null}
                      {member.role}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Teams Section */}
            {workspace && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-foreground">Teams</h2>
                  {String(user?.id) === String(workspace.ownerId) && (
                    <div className="flex gap-2">
                      <input
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="New team name"
                        className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 max-w-[150px]"
                      />
                      <button
                        onClick={addTeam}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200"
                        disabled={!newTeamName.trim()}
                      >
                        <Plus className="w-3 h-3" />
                        Create
                      </button>
                    </div>
                  )}
                </div>

                {teams.length > 0 ? (
                  <div className="space-y-4">
                    {teams.map((team) => (
                      <div key={team.id} className="border border-border rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="font-medium text-foreground">{team.name}</h3>
                          <button 
                            onClick={() => setSelectedTeam(selectedTeam === team.id ? null : team.id)}
                            className="text-xs text-primary hover:underline"
                          >
                            {selectedTeam === team.id ? 'Hide Members' : 'Show Members'}
                          </button>
                        </div>
                        
                        {selectedTeam === team.id && (
                          <div className="space-y-2">
                            {team.members.map(member => (
                              <div key={member.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs">
                                    {member.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-sm">{member.name}</span>
                                </div>
                                {String(user?.id) === String(workspace.ownerId) && (
                                  <button 
                                    onClick={() => handleAddUserToTeam(team.id, member.id)}
                                    className="text-xs text-red-500 hover:underline"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                            
                            {String(user?.id) === String(workspace.ownerId) && (
                              <div className="mt-3 pt-3 border-t border-border">
                                <label className="text-xs text-muted-foreground block mb-1">Add member to team:</label>
                                <Select onValueChange={(value) => handleAddUserToTeam(team.id, value)}>
                                  <SelectTrigger className="w-full text-xs bg-background border border-border rounded p-1.5 h-9">
                                    <SelectValue placeholder="Select a member" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {members
                                      .filter(m => !team.members.some(tm => tm.id === m.id))
                                      .map(member => (
                                        <SelectItem key={member.id} value={member.id}>
                                          {member.name}
                                        </SelectItem>
                                      ))
                                    }
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No teams created yet.</p>
                )}
              </div>
            )}

            {/* Invite Link */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Share Invite Link</h3>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground"
                />
                <button onClick={handleCopyInviteLink} className="p-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors">
                  <Copy className="w-4 h-4 text-foreground" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">Team Chat</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Chat with your team members</p>
              
              {workspace && teams.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  <button
                    className={`text-xs px-2 py-1 rounded ${
                      !selectedTeam 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                    onClick={() => {
                      setSelectedTeam(null);
                      loadChatMessages(joinedWorkspaceId!);
                    }}
                  >
                    All Members
                  </button>
                  {teams.map(team => (
                    <button
                      key={team.id}
                      className={`text-xs px-2 py-1 rounded ${
                        selectedTeam === team.id 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                      onClick={() => {
                        setSelectedTeam(team.id);
                        loadChatMessages(joinedWorkspaceId!);
                      }}
                    >
                      {team.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/10">
              {chatMessages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {typeof msg.userName === 'string' ? msg.userName.charAt(0) : (typeof msg.user === 'string' ? msg.user.charAt(0) : '?')}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm text-foreground">
                        {msg.userName || msg.user || 'Unknown User'}
                      </span>
                      <span className="text-xs text-muted-foreground">{msg.time}</span>
                    </div>
                    <p className="text-sm text-foreground mt-1">{msg.message}</p>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Message Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  disabled={!joinedWorkspaceId}
                />
                <button 
                  onClick={handleSendMessage} 
                  disabled={!newMessage.trim() || !joinedWorkspaceId}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'join' && (
          <div className="animate-fade-in">
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-foreground mb-1">Join Workspace</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Join an existing shared workspace using an invite code.
              </p>
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="XXXX-XXXX"
                className="w-full max-w-xs mx-auto bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-center text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring tracking-wider font-mono"
              />
              <button
                onClick={handleJoinWorkspace}
                className="mt-4 block mx-auto px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-all duration-200 hover:scale-105 disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Joining...
                  </>
                ) : 'Join Workspace'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Collaboration;