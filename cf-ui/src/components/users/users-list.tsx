'use client';

import {useState} from 'react';
import {Plus, Users as UsersIcon, Mail, Calendar, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader} from '@/components/ui/card';
import {EmptyState} from '@/components/ui/empty-state';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {AddUserDialog} from './add-user-dialog';
import {useUsers} from '@/hooks/useApi';
import {safeGetDate} from '@/lib/utils';

interface UsersListProps {
  workspaceId: string;
}

export function UsersList({workspaceId}: UsersListProps) {
  const {users, addUser, removeUser} = useUsers(workspaceId);
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<{open: boolean; userId: string | null; userName: string}>({
    open: false,
    userId: null,
    userName: ''
  });
  const [deleting, setDeleting] = useState(false);

  const handleAddUser = async (data: {name: string; email: string}) => {
    await addUser(data);
  };

  const handleDeleteUser = async () => {
    if (!deleteUserConfirm.userId) return;

    setDeleting(true);
    await removeUser(deleteUserConfirm.userId);
    setDeleteUserConfirm({open: false, userId: null, userName: ''});
    setDeleting(false);
  };

  const openDeleteUserConfirm = (userId: string, userName: string) => {
    setDeleteUserConfirm({open: true, userId, userName});
  };

  return (
    <>
      <Card className="w-full max-w-5xl">
        <CardHeader>
          <div className="flex items-center justify-end">
            <Button onClick={() => setIsAddUserDialogOpen(true)} variant="outline" className="gap-2 border-2">
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center min-h-[500px]">
          {users.length === 0 ? (
            <div className="flex items-center justify-center w-full">
              <EmptyState
                icon={UsersIcon}
                title="No users yet"
                description="Add users to this workspace."
                actionLabel="Add User"
                onAction={() => setIsAddUserDialogOpen(true)}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                          <span className="text-sm text-blue-600 dark:text-blue-400">{user.name.charAt(0)}</span>
                        </div>
                        <span className="dark:text-white">{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Mail className="w-4 h-4" />
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Calendar className="w-4 h-4" />
                        {safeGetDate(user.created_at)?.toLocaleDateString() || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 dark:text-red-400"
                        onClick={() => openDeleteUserConfirm(user.id, user.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddUserDialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen} onSuccess={handleAddUser} />

      <ConfirmDialog
        open={deleteUserConfirm.open}
        onOpenChange={(open) => setDeleteUserConfirm({open, userId: null, userName: ''})}
        onConfirm={handleDeleteUser}
        title="Remove User"
        description={`Are you sure you want to remove "${deleteUserConfirm.userName}" from this workspace? They will lose access to all workspace resources.`}
        confirmText="Remove User"
        variant="destructive"
        loading={deleting}
      />
    </>
  );
}
