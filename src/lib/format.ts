export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);

  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
  }
  return `${pad(m)}:${pad(s)}:${pad(f)}`;
}

export function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m}:${pad(s)}.${ms.toString().padStart(3, '0')}`;
}

export function formatTimePrecise(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 10000);
  return `${m}:${pad(s)}.${ms.toString().padStart(4, '0')}`;
}

export function parseTimeInput(value: string): number | null {
  const match = value.match(/^(\d+):(\d{1,2})\.(\d{1,4})$/);
  if (match) {
    const m = parseInt(match[1], 10);
    const s = parseInt(match[2], 10);
    const frac = match[3].padEnd(4, '0');
    return m * 60 + s + parseInt(frac, 10) / 10000;
  }
  const secMatch = value.match(/^(\d+\.?\d*)$/);
  if (secMatch) return parseFloat(secMatch[1]);
  return null;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
