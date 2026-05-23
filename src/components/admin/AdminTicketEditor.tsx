import TicketEditModal from './TicketEditModal';
import { mockTipsService } from '../../services/mockTips';
import { Tip } from '../../types';

type AdminTicketEditorProps = {
  tip: Tip | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

export default function AdminTicketEditor({ tip, onClose, onChanged }: AdminTicketEditorProps) {
  if (!tip) return null;

  const handleSave = async (updatedTip: Tip) => {
    await mockTipsService.updateTip(updatedTip);
    await onChanged();
  };

  const handleDelete = async (tipId: string) => {
    await mockTipsService.deleteTip(tipId);
    await onChanged();
  };

  return (
    <TicketEditModal
      tip={tip}
      onClose={onClose}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  );
}
