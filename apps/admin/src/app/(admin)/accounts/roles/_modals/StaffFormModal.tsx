'use client';

import toast from 'react-hot-toast';
import { Button } from '@tarodan/ui';
import { FormInput, FormSelect, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { ROLES, ROLE_META, type RoleId } from '../_lib/constants';
import { staffSchema, type StaffFormValues } from '../_lib/schema';
import type { StaffItem } from '../_lib/types';

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }));

/**
 * Staff assignment / role update modal. Owns its own form (zod) + mutation;
 * the page only holds open/close state. When a new account is created, it reports
 * the temporary password to the parent via `onCreated` (the notice band is shown there).
 */
export function StaffFormModal({
  open,
  onClose,
  editing,
  permissions,
  onCreated,
  onShowMatrix,
}: {
  open: boolean;
  onClose: () => void;
  editing: StaffItem | null;
  permissions: Record<string, string[]>;
  onCreated: (info: { email: string; password: string }) => void;
  onShowMatrix: () => void;
}) {
  const isEdit = Boolean(editing);
  const form = useZodForm(staffSchema, {
    defaultValues: {
      email: editing?.email ?? '',
      role: (editing?.role as RoleId) ?? 'moderator',
      password: '',
      displayName: '',
    },
  });

  const selectedRole = form.watch('role');

  const save = useAdminMutation(
    (v: StaffFormValues) =>
      editing
        ? adminApi.updateStaff(editing.id, { role: v.role })
        : adminApi.assignStaff({
            email: v.email,
            role: v.role,
            ...(v.password ? { password: v.password } : {}),
            ...(v.displayName ? { displayName: v.displayName } : {}),
          }),
    {
      invalidates: ['staff'],
      onSuccess: (res, v) => {
        onClose();
        if (editing) {
          toast.success('Kullanıcı rolü güncellendi');
        } else {
          toast.success('Kullanıcıya rol atandı');
          const tempPassword = (res as { data?: { tempPassword?: string } })?.data?.tempPassword;
          if (tempPassword) onCreated({ email: v.email, password: tempPassword });
        }
      },
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Rolü Güncelle' : 'Kullanıcıya Rol Ata'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Ata'}
    >
      <FormInput
        name="email"
        label="Kullanıcı E-posta"
        type="email"
        placeholder="ornek@email.com"
        disabled={isEdit}
        helperText={
          isEdit
            ? 'E-posta adresi değiştirilemez.'
            : 'E-posta kayıtlı değilse hesap otomatik oluşturulur.'
        }
      />

      {!isEdit && (
        <>
          <FormInput
            name="displayName"
            label="Görünen Ad"
            placeholder="Boş bırakılırsa e-postadan türetilir"
          />
          <FormInput
            name="password"
            label="Başlangıç Şifresi"
            placeholder="Boş bırakılırsa otomatik üretilir"
          />
        </>
      )}

      <FormSelect name="role" label="Atanacak Rol" options={roleOptions} />

      {selectedRole && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${ROLE_META[selectedRole]?.color}`}>
          <p className="font-medium">{ROLE_META[selectedRole]?.label}</p>
          <p className="mt-0.5 opacity-80">{ROLE_META[selectedRole]?.description}</p>
          {selectedRole !== 'super_admin' && (
            <p className="mt-1 opacity-70">
              {(permissions[selectedRole] ?? []).length} izne sahip.{' '}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onClose();
                  onShowMatrix();
                }}
                className="h-auto p-0 text-xs underline"
              >
                İzin matrisini gör →
              </Button>
            </p>
          )}
        </div>
      )}
    </FormModal>
  );
}
