export const formatDate = (isoString: string | null | undefined, fallback = 'Date inconnue'): string => {
  if (!isoString) return fallback;
  const date = new Date(isoString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const formatShortDate = (isoString: string | null | undefined, fallback = ''): string => {
  if (!isoString) return fallback;
  const date = new Date(isoString);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatTime = (isoString: string | null | undefined, fallback = ''): string => {
  if (!isoString) return fallback;
  const date = new Date(isoString);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};
