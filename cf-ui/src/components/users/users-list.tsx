'use client';

import {useState} from 'react';
import {Plus, Users as UsersIcon, Mail, Calendar, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ListShell} from '@/components/ui/list-shell';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {AddUserDialog} from './add-user-dialog';
import {useUsers} from '@/hooks/useApi';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {safeGetDate, parseError} from '@/lib/utils';
import {toast} from 'sonner';

export function UsersList() {
  const {workspaceId} = useCurrentWorkspace();
  const {users, addUser, removeUser} = useUsers(workspaceId || '');
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();

  const handleAddUser = async (data: {name: string; email: string}) => {
    try {
      await addUser(data);
    } catch (e) {
      toast.error(parseError(e));
    }
  };

  const handleDeleteUser = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await removeUser(data.id);
      } catch (e) {
        toast.error(parseError(e));
        throw e;
      }
    });
  };

  return (
    <>
      <ListShell
        title="Users"
        description="Manage access to this workspace"
        headerRight={
          <Button onClick={() => setIsAddUserDialogOpen(true)} variant="outline" className="gap-2 border-2">
            <Plus className="w-4 h-4" />
            Add User
          </Button>
        }
        empty={{
          icon: UsersIcon,
          title: 'No users yet',
          description: 'Add users to this workspace.',
          actionLabel: 'Add User',
          onAction: () => setIsAddUserDialogOpen(true)
        }}
      >
        {users.length > 0 ? (
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
                    <div className="flex items-center gap-2 page-description">
                      <Mail className="w-4 h-4" />
                      {user.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 page-description">
                      <Calendar className="w-4 h-4" />
                      {safeGetDate(user.created_at)?.toLocaleDateString() || 'N/A'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 dark:text-red-400"
                      onClick={() => deleteDialog.open({id: user.id, name: user.name})}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </ListShell>

      <AddUserDialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen} onSuccess={handleAddUser} />

      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && deleteDialog.close()}
        onConfirm={handleDeleteUser}
        title="Remove User"
        description={`Are you sure you want to remove "${deleteDialog.data?.name}" from this workspace? They will lose access to all workspace resources.`}
        confirmText="Remove User"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
