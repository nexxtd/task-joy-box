import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Info } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  onNotify?: () => void;
}

const ComingSoon: React.FC<ComingSoonProps> = ({ title, description, icon, onNotify }) => {
  const { user } = useAuth();
  const isFree = !user?.subscriptionTier || user.subscriptionTier === 'free';

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
        {icon || <Info className="w-6 h-6 text-primary" />}
      </div>
      <h4 className="text-sm font-semibold text-foreground mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">{description}</p>
      {isFree ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Coming soon! <span className="font-medium text-primary">Upgrade to Pro or Premium</span> to get early access and automatic email notifications on major updates.
          </p>
          <button
            onClick={onNotify}
            className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200"
          >
            Upgrade to get notified
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/70">
          <span className="font-medium text-primary">Auto-notified</span> by email on major updates — no action needed.
        </p>
      )}
    </div>
  );
};

export default ComingSoon;
