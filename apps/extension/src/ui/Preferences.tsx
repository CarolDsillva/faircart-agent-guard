import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, getSettings, setSettings, type Settings } from '../store/storage';

/** Companion behaviour and detection sensitivity. Saved immediately. */
export function Preferences() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    void getSettings().then(setS);
  }, []);
  const update = async (patch: Partial<Settings>) => setS(await setSettings(patch));

  return (
    <div className="prefs">
      <div className="pref">
        <div>
          <b>Companion</b>
          <p className="muted small">The small FairCart button on shopping pages. Drag it anywhere to pin it there.</p>
        </div>
        <div className="seg" role="group" aria-label="Companion">
          {(['follow', 'pinned', 'hidden'] as const).map((m) => (
            <button key={m} aria-pressed={s.companion === m} onClick={() => void update({ companion: m })}>
              {m === 'follow' ? 'Near cursor' : m === 'pinned' ? 'Pinned' : 'Hidden'}
            </button>
          ))}
        </div>
      </div>
      <div className="pref">
        <div>
          <b>Hover actions</b>
          <p className="muted small">After you rest on a price, fee, timer or add-on, show one quick action next to it.</p>
        </div>
        <button className="switch" role="switch" aria-checked={s.hoverHints} aria-label="Hover actions" onClick={() => void update({ hoverHints: !s.hoverHints })} />
      </div>
      <div className="pref">
        <div>
          <b>Sensitivity</b>
          <p className="muted small">Standard raises only well-evidenced issues. High also runs experimental checks that may be wrong more often.</p>
        </div>
        <div className="seg" role="group" aria-label="Sensitivity">
          {(['standard', 'high'] as const).map((m) => (
            <button key={m} aria-pressed={s.sensitivity === m} onClick={() => void update({ sensitivity: m })}>
              {m === 'standard' ? 'Standard' : 'High'}
            </button>
          ))}
        </div>
      </div>
      {s.pausedRetailers.length > 0 && (
        <div className="pref">
          <div>
            <b>Paused sites</b>
            <p className="muted small">{s.pausedRetailers.join(', ')}</p>
          </div>
          <button className="btn btn--small" onClick={() => void update({ pausedRetailers: [] })}>
            Resume all
          </button>
        </div>
      )}
    </div>
  );
}
