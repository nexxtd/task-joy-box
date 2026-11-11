import React from 'react';
import { ExternalLink, MessageSquare } from 'lucide-react';

interface DiscordCommunitySectionProps {
  className?: string;
}

export const DiscordCommunitySection: React.FC<DiscordCommunitySectionProps> = ({ className = '' }) => {
  const discordUrl = 'https://discord.gg/planora';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-[#5865F2]/30 bg-gradient-to-r from-[#5865F2]/10 via-[#5865F2]/5 to-background p-6 shadow-sm transition-all hover:border-[#5865F2]/50 hover:shadow-md ${className}`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#5865F2] text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-[#5865F2]/20">
            {/* Discord SVG Logo */}
            <svg className="w-6 h-6 fill-current" viewBox="0 0 127.14 96.36">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              Join our Discord Community
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">
              Connect with fellow users, ask questions, get instant updates, share productivity strategies, and chat directly with the team.
            </p>
          </div>
        </div>
        <a
          href={discordUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#4752C4] active:scale-[0.98] flex-shrink-0"
        >
          <MessageSquare className="w-4 h-4" />
          Join Discord
          <ExternalLink className="w-3.5 h-3.5 opacity-80" />
        </a>
      </div>
    </div>
  );
};

export default DiscordCommunitySection;

