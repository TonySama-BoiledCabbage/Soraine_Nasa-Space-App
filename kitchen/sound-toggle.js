// Mute button, top left on every page including the start screen; M toggles it too.
// The choice is stored by sfx (localStorage), so it survives a reload.
const ON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a7.6 7.6 0 0 1 0 11"/></svg>';
const OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>';

export function mountSoundToggle(sfx) {
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'sound-toggle';
  const render = () => {
    b.innerHTML = sfx.muted ? OFF : ON;
    b.setAttribute('aria-pressed', String(sfx.muted));
    b.setAttribute('aria-label', sfx.muted ? 'Sound off. Turn sound on (M)' : 'Sound on. Mute (M)');
    b.title = sfx.muted ? 'Sound off (M)' : 'Mute (M)';
  };
  const toggle = () => { sfx.setMuted(!sfx.muted); render(); };
  b.addEventListener('click', toggle);
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'm') return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    toggle();
  });
  render(); document.body.append(b);
  return b;
}
