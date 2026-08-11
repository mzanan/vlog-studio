import { notifications } from '@mantine/notifications';

// Compartido por Editor.tsx y ExportView.tsx: ambos pegan a POST /export y
// necesitan el mismo aviso cuando el render terminó pero le falta música/VO.
export function showExportResultNotification(opts: { filename: string; warnings: string[] }): void {
  if (opts.warnings.length > 0) {
    notifications.show({
      color: 'yellow',
      title: `Render listo con ${opts.warnings.length} advertencia${opts.warnings.length > 1 ? 's' : ''}`,
      message: `${opts.filename}: ${opts.warnings.join(' ')}`,
      autoClose: false,
    });
    return;
  }
  notifications.show({
    color: 'teal',
    title: 'Render listo',
    message: opts.filename,
    autoClose: 6000,
  });
}
