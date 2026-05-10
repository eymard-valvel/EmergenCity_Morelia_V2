import React, { useState, useEffect } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function VideoLlamada() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	// 1. Recuperar datos de la URL y LocalStorage
	const roomCode = searchParams.get('room');
	const [userData, setUserData] = useState(null);

	useEffect(() => {
		// Intentar recuperar el nombre del usuario desde el localStorage
		// (Lo guardamos en VideoCall.jsx antes de navegar)
		const storedData = localStorage.getItem('videoCallData');
		if (storedData) {
			setUserData(JSON.parse(storedData));
		}
	}, []);

	// Si no hay código de sala, regresar
	if (!roomCode) {
		return (
			<div className="flex items-center justify-center h-screen">
				<p>Error: No se especificó una sala.</p>
				<button onClick={() => navigate('/')}>Volver</button>
			</div>
		);
	}

	// Nombre del usuario (Fallback por si acaso)
	const displayName = userData?.userName || `Usuario-${Math.floor(Math.random()*1000)}`;

	return (
		<div style={{ height: '100vh', width: '100%' }}>
			<JitsiMeeting
				// 2. Configuración de la Sala
				// El 'roomName' es la clave: si todos tienen el mismo ID, entran a la misma sala.
				roomName={`EmergenCity-${roomCode}`}

				configOverwrite={{
					startWithAudioMuted: false,
					disableThirdPartyRequests: true,
					prejoinPageEnabled: false, // Entrar directo sin pre-sala de Jitsi
				}}
				interfaceConfigOverwrite={{
					TOOLBAR_BUTTONS: [
						'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
						'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
						'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
						'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
						'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone',
						'security'
					],
				}}
				userInfo={{
					displayName: displayName
				}}
				onApiReady={(externalApi) => {
					// Aquí puedes controlar la API de Jitsi si necesitas
				}}
				onReadyToClose={() => {
					// Cuando cuelgan la llamada
					navigate('/'); // O redirigir al dashboard correspondiente
				}}
				getIFrameRef={(iframeRef) => {
					iframeRef.style.height = '100%';
				}}
			/>
		</div>
	);
}
