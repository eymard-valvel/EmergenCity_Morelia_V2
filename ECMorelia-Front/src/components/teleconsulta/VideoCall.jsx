import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function VideoCall() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomFromUrl = searchParams.get('room');
  const roleFromUrl = searchParams.get('role');

  const [roomCode, setRoomCode] = useState('');
  const [userName, setUserName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (roomFromUrl) {
      setRoomCode(roomFromUrl);
    } else {
      // Generar código solo si no viene de URL
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
      setRoomCode(code);
    }

    // Nombre automático según rol
    if (roleFromUrl === 'doctor') {
      setUserName('EC-Doctor');
    } else if (roleFromUrl === 'paramedico') {
      setUserName('EC-Paramedico');
    } else {
      setUserName('EC-Usuario');
    }
  }, [roomFromUrl, roleFromUrl]);

  const entrarSala = () => {
    if (!roomCode.trim()) return;
    const userData = {
      roomID: roomCode.trim().toUpperCase(),
      userName: userName.trim() || 'EC-Usuario',
      timestamp: Date.now()
    };
    localStorage.setItem('videoCallData', JSON.stringify(userData));
    navigate(`/videollamada?room=${roomCode.trim().toUpperCase()}&user=${encodeURIComponent(userData.userName)}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '440px', background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '28px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: roomFromUrl ? '#ef4444' : '#0ea5e9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <svg width="32" height="32" fill="none" stroke="white" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
            {roomFromUrl ? 'LLAMADA ENTRANTE' : 'VIDEOLLAMADA'}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '8px' }}>
            {roomFromUrl ? 'Confirme para contestar' : 'Cree o únase a una sala segura'}
          </p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', color: '#94a3b8' }}>
            Nombre
          </label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px',
              border: '1px solid #334155', background: 'rgba(0,0,0,0.3)',
              color: 'white', fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', color: '#94a3b8' }}>
            Código de sala
          </label>
          <input
            type="text"
            value={roomCode}
            readOnly={!!roomFromUrl}
            onChange={(e) => !roomFromUrl && setRoomCode(e.target.value.toUpperCase())}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px',
              border: '1px solid #334155',
              background: roomFromUrl ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)',
              color: 'white', fontSize: '1.1rem', fontFamily: 'monospace',
              textAlign: 'center', letterSpacing: '2px'
            }}
          />
        </div>

        <button
          onClick={entrarSala}
          disabled={!roomCode.trim()}
          style={{
            width: '100%', padding: '16px', borderRadius: '12px',
            background: roomFromUrl ? '#10b981' : '#0284c7',
            color: 'white', border: 'none', fontSize: '1rem',
            fontWeight: 900, letterSpacing: '1px', cursor: 'pointer',
            textTransform: 'uppercase'
          }}
        >
          {roomFromUrl ? 'CONTESTAR LLAMADA' : 'ENTRAR A SALA'}
        </button>
      </div>
    </div>
  );
}