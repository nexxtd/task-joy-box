const keyFor = (userId: number) => `tutorial_completed_${userId}`;

export function hasCompletedTutorialLocally(userId: number): boolean {
  try {
    // Keep the previous app-wide flag for people who already finished onboarding.
    const completed = localStorage.getItem(keyFor(userId)) === 'true' || localStorage.getItem('tutorial_completed') === 'true';
    if (completed) localStorage.setItem(keyFor(userId), 'true');
    return completed;
  } catch {
    return false;
  }
}

export function markTutorialCompleted(userId: number): void {
  try {
    localStorage.setItem(keyFor(userId), 'true');
    localStorage.setItem('tutorial_completed', 'true');
  } catch {}
  fetch('/api/settings', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tutorialCompleted: true }),
  }).catch(() => {});
}
