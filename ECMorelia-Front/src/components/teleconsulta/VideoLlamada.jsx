import React, { useState, useEffect } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';
import { useNavigate, useSearchParams } from 'react-router-dom';

// App ID de JaaS (Jitsi as a Service) — reemplaza con tu App ID
// Si no tienes JaaS, dejarlo vacío y funcionará con el servidor público (5 min)
const JAAS_APP_ID = import.meta.env.VITE_JAAS_APP_ID || '';

export default function VideoLlamada() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomCode = searchParams.get('room');
  const userFromUrl = searchParams.get('user');
  const [displayName, setDisplayName] = useState('EC-Usuario');

useEffect(() => {
  const role = searchParams.get('role');
  if (userFromUrl) {
    setDisplayName(decodeURIComponent(userFromUrl));
    return;
  }
  if (role === 'doctor') {
    setDisplayName('EC-Doctor');
  } else if (role === 'paramedico') {
    setDisplayName('EC-Paramedico');
  } else {
    setDisplayName('EC-Usuario');
  }
}, [userFromUrl, searchParams]);

  if (!roomCode) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '1.2rem', fontWeight: 900 }}>Error: No se especificó una sala.</p>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '12px 24px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 900, cursor: 'pointer' }}
        >
          VOLVER
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100%' }}>
<JitsiMeeting
  domain={JAAS_APP_ID ? '8x8.vc' : 'meet.jit.si'}
  roomName={JAAS_APP_ID ? `${JAAS_APP_ID}/${roomCode}` : `EmergenCity-${roomCode}`}
  configOverwrite={{
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    disableThirdPartyRequests: true,
    prejoinPageEnabled: false,
    enableWelcomePage: false,
    disableDeepLinking: true,
    requireDisplayName: false,
    defaultLanguage: 'es',
    toolbarButtons: [
      'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
      'fodeviceselection', 'hangup', 'profile', 'chat', 'raisehand',
      'videoquality', 'filmstrip', 'tileview', 'videobackgroundblur', 'settings'
    ]
  }}
  interfaceConfigOverwrite={{
    SHOW_JITSI_WATERMARK: false,
    SHOW_WATERMARK_FOR_GUESTS: false,
    DEFAULT_BACKGROUND: '#09090b',
    DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
    MOBILE_APP_PROMO: false
  }}
  userInfo={{ displayName, email: '' }}
  onApiReady={(externalApi) => {
    externalApi.addListener('videoConferenceLeft', () => navigate('/'));
  }}
  onReadyToClose={() => navigate('/')}
  getIFrameRef={(iframeRef) => {
    iframeRef.style.height = '100%';
    iframeRef.style.width = '100%';
    iframeRef.style.border = 'none';
  }}
/>
    </div>
  );
}