'use client';

import {useState} from 'react';
import {Mail, Check, X, Clock, Briefcase, AlertCircle, Users, CheckCircle, XCircle} from 'lucide-react';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {BasePage} from '@/components/ui/base-page';
import {LoaderRelative} from '@/components/ui/loading';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {ListShell} from '@/components/ui/list-shell';
import {useMyPendingInvitations} from '@/hooks/useApi';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {useRouter} from 'next/navigation';
import {routes} from '@/constants/routes';
import type {Invitation} from '@/api/types';
import {mutate as swrMutate} from 'swr';
import {swrKeys} from '@/lib/swr-config';

const ROLE_PERMISSIONS = {
  admin: {
    title: 'Admin (Full Access)',
    permissions: [
      'Full access to all workspace projects and resources',
      'Create, edit, and delete workspaces and users',
      'Manage workspace members and invitations',
      'Complete control over API keys and IAM roles'
    ],
    denials: []
  },
  viewer: {
    title: 'Viewer (Read-Only Access)',
    permissions: ['View workspace projects and details', 'Access user information and profiles', 'View API keys and system resources'],
    denials: ['Cannot create, edit, delete, or manage anything']
  },
  guest: {
    title: 'Guest (No Access)',
    permissions: [],
    denials: [
      'No access to workspace projects',
      'No permissions to view any resources',
      'Cannot perform any operations',
      'Completely restricted from system activities'
    ]
  }
};

export function PendingInvitationsPage() {
  const router = useRouter();
  const {invitations, isLoading, acceptInvitation, declineInvitation, mutate} = useMyPendingInvitations();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async (invitation: Invitation) => {
    setProcessingId(invitation.id);
    setError(null);
    try {
      await acceptInvitation(invitation.id);
      toast.success(`Joined ${invitation.workspace_name}!`);
      await mutate();
      await swrMutate(swrKeys.workspaces());
      // Redirect to the workspace
      router.push(routes.workspaces.details(invitation.workspace_id));
    } catch (err) {
      const msg = parseError(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (invitation: Invitation) => {
    setProcessingId(invitation.id);
    setError(null);
    try {
      await declineInvitation(invitation.id);
      toast.success(`Declined invitation to ${invitation.workspace_name}`);
      await mutate();
    } catch (err) {
      const msg = parseError(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setProcessingId(null);
    }
  };

  const getExpiresInDays = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const pendingInvitations = invitations.filter((inv) => inv.status === 'pending');

  if (isLoading) {
    return (
      <BasePage title="Pending Invitations">
        <LoaderRelative />
      </BasePage>
    );
  }

  return (
    <BasePage title="Pending Invitations" description="Review and respond to workspace invitations">
      {error && (
        <Alert variant="destructive" dismissible onDismiss={() => setError(null)} className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {pendingInvitations.length === 0 ? (
        <ListShell
          empty={{
            icon: Mail,
            title: 'No pending invitations',
            description: "You don't have any pending workspace invitations at the moment.",
            actionLabel: 'Go to Workspaces',
            href: routes.workspaces.list
          }}
        />
      ) : (
        <div className="list-grid">
          {pendingInvitations.map((invitation: Invitation) => {
            const daysLeft = getExpiresInDays(invitation.expires_at);
            const isExpiring = daysLeft <= 2;
            const roleInfo = ROLE_PERMISSIONS[invitation.role as keyof typeof ROLE_PERMISSIONS] || ROLE_PERMISSIONS.guest;

            return (
              <Card key={invitation.id} variant="list" className="transition-shadow duration-200 !p-0 overflow-hidden">
                <div className="bg-[hsl(var(--sidebar-active))] border-b-2 border-[hsl(var(--sidebar-active-border))] p-5 -m-px">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-white/50 w-11 h-11 flex items-center justify-center shrink-0">
                        <Briefcase className="w-5 h-5 text-[hsl(var(--sidebar-active-border))]" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-base truncate mb-0.5">{invitation.workspace_name}</h4>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3.5 h-3.5" />
                          <span>Workspace</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-3">You&apos;ve been invited by</p>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[hsl(var(--sidebar-active-border))] flex items-center justify-center text-white font-semibold text-xs">
                        {invitation.inviter_username?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <p className="font-medium text-sm">{invitation.inviter_username}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2.5">{roleInfo.title}</h4>
                    <div className="space-y-2 pt-2">
                      {roleInfo.permissions.map((permission, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="size-4 text-green-600" />
                          <span className="text-muted-foreground">{permission}</span>
                        </div>
                      ))}
                      {roleInfo.denials.map((denial, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <XCircle className="size-4 text-red-500" />
                          <span className="text-muted-foreground">{denial}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {daysLeft <= 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">This invitation has expired</AlertDescription>
                    </Alert>
                  )}

                  {daysLeft > 0 && (
                    <div className={`flex items-center gap-1.5 text-xs ${isExpiring ? 'text-red-600' : 'text-muted-foreground'}`}>
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        Expires in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={() => handleAccept(invitation)}
                      disabled={processingId === invitation.id || daysLeft <= 0}
                      variant="sidebar"
                      className="flex-1"
                    >
                      {processingId === invitation.id ? (
                        'Processing...'
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Accept
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDecline(invitation)}
                      disabled={processingId === invitation.id || daysLeft <= 0}
                      className="shrink-0"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Decline
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </BasePage>
  );
}
