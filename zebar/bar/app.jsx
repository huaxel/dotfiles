import React, { providers, useContext } from 'https://esm.sh/zebar@2';

const providersList = [providers.glazewm, providers.date, providers.audio, providers.cpu];

export default function App() {
  const output = providers.useProviders(providersList);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: '100%', padding: '0 12px', fontFamily: 'JetBrainsMono Nerd Font, monospace',
      fontSize: '12px', background: '#1a1b26', color: '#a9b1d6',
      borderBottom: '1px solid #33467c'
    }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {output.glazewm?.currentWorkspaces?.map((ws) => (
          <button
            key={ws.name}
            onClick={() => output.glazewm.runCommand(`focus --workspace ${ws.name}`)}
            style={{
              border: 'none', borderRadius: '4px', padding: '2px 8px',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px',
              background: ws.hasFocus ? '#7aa2f7' : 'transparent',
              color: ws.hasFocus ? '#1a1b26' : ws.isDisplayed ? '#7aa2f7' : '#565f89',
            }}
          >
            {ws.name}
          </button>
        ))}
      </div>

      <div style={{ color: '#565f89', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {output.glazewm?.focusedWindow?.title || ''}
      </div>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {output.cpu && <span style={{ color: '#f7768e' }}>{Math.round(output.cpu.usage)}%</span>}
        {output.audio?.defaultPlaybackDevice && (
          <span style={{ color: '#7aa2f7' }}>{Math.round(output.audio.defaultPlaybackDevice.volume)}%</span>
        )}
        {output.date && <span style={{ color: '#9ece6a' }}>{output.date.formatted}</span>}
      </div>
    </div>
  );
}
