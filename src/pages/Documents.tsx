import React from 'react';
import ComingSoon from '@/components/shared/ComingSoon';

const DESCRIPTION =
  'Create, edit and organize rich documents right alongside your tasks. Word documents, Google Docs, PDFs, RTF & text — create, open, edit & export. Coming soon.';

/**
 * Documents is not built yet. Unlike Calendar/Collaboration (which admins can
 * preview), there is no admin implementation to fall back to, so this page
 * always shows the Coming Soon preview.
 */
const Documents: React.FC = () => (
  <div className="flex w-full min-h-[70vh] items-center justify-center p-8 bg-background">
    <div className="max-w-lg">
      <ComingSoon title="Documents" accent="emerald" description={DESCRIPTION} />
    </div>
  </div>
);

export default Documents;
