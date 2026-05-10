import React, { useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
// 1. Importamos ChakraProvider y componentes de UI necesarios
import { ChakraProvider, useToast, Button, Box, Text, Flex } from "@chakra-ui/react";

import logo from "../img/Logo.png";
import { useAuth } from "../../auth/useAuth";
import { deleteCookie } from "../../helpers/cookies";

// 2. Componente interno con la lógica (separado para estar dentro del Provider)
function DoctorLayoutContent() {
	const navigate = useNavigate();
	const { setAuth } = useAuth();

	// Hooks que requieren estar dentro de ChakraProvider
	const toast = useToast();
	const ws = useRef(null);

	// ---------------------------------------------------------
	// 🔌 Conexión WebSocket para Alertas de Emergencia
	// ---------------------------------------------------------
	useEffect(() => {
		// Conectar al puerto 8081 (donde está el servidor de alertas)
		ws.current = new WebSocket(import.meta.env.VITE_WS_URL);

		ws.current.onopen = () => {
			console.log("👨‍⚕️ Médico conectado al sistema de urgencias");
		};

		ws.current.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				// Escuchar la alerta de traslado
				if (data.type === 'patient_transfer_notification') {

					// Mostrar Toast Interactivo (Notificación Flotante)
					toast({
						position: "top-right",
						duration: null, // No se cierra sola, requiere acción
						isClosable: true,
						render: ({ onClose }) => (
							<Box
								color="white"
								p={4}
								bg="red.600"
								borderRadius="md"
								boxShadow="dark-lg"
								border="2px solid white"
								maxWidth="350px"
							>
								<Flex align="center" mb={3}>
									<Text fontSize="3xl" mr={3}>🚨</Text>
									<Box>
										<Text fontWeight="bold" fontSize="lg" lineHeight="1.2">¡URGENCIA ENTRANTE!</Text>
										<Text fontSize="sm">Ambulancia: {data.ambulanceId || 'UVI'}</Text>
										{data.eta && <Text fontSize="xs">ETA: {data.eta}</Text>}
									</Box>
								</Flex>

								<Button
									size="sm"
									width="100%"
									bg="white"
									color="red.600"
									fontWeight="bold"
									_hover={{ bg: "gray.100", transform: "scale(1.02)" }}
									onClick={() => {
										onClose(); // Cierra la notificación
										// Abre la sala en una pestaña nueva usando el ID recibido
										window.open(`/videocall?room=${data.callId}`, '_blank');
									}}
								>
									🎥 CONTESTAR VIDEOLLAMADA
								</Button>
							</Box>
						),
					});
				}
			} catch (error) {
				console.error("Error socket médico:", error);
			}
		};

		// Limpiar conexión al desmontar
		return () => {
			if (ws.current) ws.current.close();
		};
	}, [toast]);
	// ---------------------------------------------------------

	const handleLogout = () => {
		setAuth(false);
		deleteCookie("role");
		navigate("/login");
	};

	const activeTab = "text-sky-blue bg-sky-blue/10 dark:bg-sky-blue/20 font-semibold";

	return (
		<div className="flex w-full min-h-screen font-sans text-gray-900">

			{/* Barra de Navegación Lateral (Sidebar) */}
			<nav className="flex flex-col w-full max-w-[250px] py-3 min-h-full gap-3 bg-smoke-white text-bluish-gray dark:bg-bluish-gray dark:text-smoke-white shadow-lg shrink-0">
				<ul className="flex flex-col pt-0 m-0 h-full">
					{/* Sección del Logo */}
					<li className="flex justify-center p-4 mb-4 border-b border-gray-200 dark:border-gray-700">
						<img className="max-w-24 max-h-24 w-auto h-auto" src={logo} alt="Emergencity" />
					</li>

					{/* Botón Llamada Manual */}
					<li className="px-4 mb-4">
						<button
							id="botonLlamada"
							className="w-full relative inline-flex items-center justify-center p-0.5 overflow-hidden text-sm font-medium text-bluish-gray dark:text-smoke-white rounded-lg group bg-gradient-to-br from-coral-red to-red-400 group-hover:from-coral-red group-hover:to-red-400 hover:text-white focus:ring-4 focus:outline-none focus:ring-red-300 dark:focus:ring-red-800"
							onClick={() => navigate("/videocall")}
						>
              				<span className="w-full relative px-5 py-2.5 transition-all ease-in duration-75 bg-smoke-white dark:bg-bluish-gray rounded-md group-hover:bg-opacity-0 text-lg">
								Videollamada
              				</span>
						</button>
					</li>

					{/* NavLink Reportes */}
					<li>
						<NavLink
							to="/doctor/records"
							className={({ isActive }) =>
								`block py-2 px-4 text-base md:text-lg capitalize hover:bg-sky-blue/10 dark:hover:bg-sky-blue/20 rounded-md mx-2 transition-colors duration-150 ${
									isActive ? activeTab : "text-bluish-gray dark:text-smoke-white"
								}`
							}
						>
							Reportes
						</NavLink>
					</li>

					{/* Espaciador */}
					<li className="flex-grow"></li>

					{/* Botón Cerrar sesión */}
					<li className="mt-auto mb-2 mx-2">
						<p
							className={`block py-2 px-4 text-base md:text-lg capitalize text-coral-red dark:text-red-400 hover:bg-red-100/50 dark:hover:bg-red-500/20 hover:font-semibold rounded-md cursor-pointer transition-colors duration-150`}
							onClick={handleLogout}
						>
							Cerrar sesión
						</p>
					</li>
				</ul>
			</nav>

			{/* Área de Contenido Principal */}
			<main className="flex-grow p-4 sm:p-6 lg:p-8 bg-gray-100 dark:bg-gray-900 overflow-y-auto">
				<Outlet />
			</main>
		</div>
	);
}

// 3. Exportamos el Wrapper que contiene el Provider para asegurar que useToast funcione
export default function DoctorLayout() {
	return (
		<ChakraProvider>
			<DoctorLayoutContent />
		</ChakraProvider>
	);
}
