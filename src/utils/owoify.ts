const faces = ['owo', 'uwu', '>w<', '^w^', '(owo)', '*blushes*'];

function applyReplacements(text: string): string {
  return text
    .replace(/(?:r|l)/g, 'w')
    .replace(/(?:R|L)/g, 'W')
    .replace(/n([aeiou])/g, 'ny$1')
    .replace(/N([aeiou])/g, 'Ny$1')
    .replace(/N([AEIOU])/g, 'NY$1')
    .replace(/ove/g, 'uv')
    .replace(/!+/g, '! owo');
}

export function owoify(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return 'owo? (no text to owoify)';
  }

  const base = applyReplacements(trimmed);
  const face = faces[Math.floor(Math.random() * faces.length)];
  return `${base} ${face}`;
}

