'use client';

import {useState} from 'react';
import {Mail, Check, X, Clock, Briefcase, AlertCircle} from 'lucide-react';
import {Card} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {BasePage} from '@/components/ui/base-page';
import {LoaderRelative} from '@/components/ui/loading';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {EmptyState} from '@/components/ui/empty-state';
import {useMyPendingInvitations} from '@/hooks/useApi';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {useRouter} from 'next/navigation';
import {routes} from '@/constants/routes';
import type {Invitation} from '@/api/types';

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
        <div className="flex items-center justify-center min-h-[50vh]">
          <EmptyState
            icon={Mail}
            title="No pending invitations"
            description="You don't have any pending workspace invitations at the moment."
            actionLabel="Go to Workspaces"
            href={routes.workspaces.list}
          />
        </div>
      ) : (
        <div className="list-grid">
          {pendingInvitations.map((invitation: Invitation) => {
            const daysLeft = getExpiresInDays(invitation.expires_at);
            const isExpiring = daysLeft <= 2;

            return (
              <Card key={invitation.id} variant="list" className="transition-shadow duration-200">
                <div className="mb-6">
                  <div className="rounded-lg bg-[hsl(var(--accent))] w-12 h-12 flex items-center justify-center mb-4">
                    <Briefcase className="w-5 h-5 text-card-foreground" />
                  </div>
                  <h4 className="card-title truncate mb-2">{invitation.workspace_name}</h4>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline">{invitation.role}</Badge>
                    {isExpiring && <Badge variant="destructive">Expires Soon</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Invited by <span className="font-medium">{invitation.inviter_username}</span>
                  </p>
                </div>

                <div className="flex items-center text-xs text-muted-foreground mb-4">
                  <Clock className="h-4 w-4 mr-2" />
                  {daysLeft > 0 ? `Expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}` : 'Expired'}
                </div>

                <div className="flex gap-2">
                  <Button onClick={() => handleAccept(invitation)} disabled={processingId === invitation.id || daysLeft <= 0} className="flex-1">
                    <Check className="h-4 w-4 mr-2" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDecline(invitation)}
                    disabled={processingId === invitation.id || daysLeft <= 0}
                    className="flex-1"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </BasePage>
  );
}
