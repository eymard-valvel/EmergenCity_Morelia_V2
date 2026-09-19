import { useNavigate } from "react-router-dom";
import usuario from '../img/recover_psswrd.jpg';
import logo from '../img/Logo.png'; // Asegúrate de que el logo esté en la carpeta correcta


const RContrasena = () => {
			const navigate = useNavigate();
			return (
				<div className="min-h-screen bg-gradient-to-b from-gray-300 via-gray-400 to-gray-500 flex flex-col font-sans">
					{/* Topbar */}
					<nav className="fixed top-0 w-full bg-gradient-to-r from-bluish-gray to-sky-400 p-3 flex items-center justify-center shadow-md z-50 px-6">
						<div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
							<img src={logo} alt="Logo" className="w-10 md:w-12" />
							<h1 className="text-neutral-300 font-black tracking-tighter text-4xl">EMERGENCITY</h1>
						</div>
            		</nav>
					{/* Contenedor del Formulario */}
						<div className="flex items-center justify-center flex-1 p-8 mt-[4.5rem]">
							<div className="flex bg-white rounded-3xl shadow-lg overflow-hidden w-full max-w-4xl">

							{/* Sección Izquierda - Imagen o detalles */}
							<div className="hidden md:flex md:w-1/2 bg-slate-100 items-center justify-center relative">
							<div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(#0ea5e9_1px,transparent_1px)] [background-size:20px_20px]"></div>
								<img 
									src={usuario} 
									alt="Auth Illustration" 
									className="h-full l-full object-cover"
								/>
							</div>
							{/* Sección Derecha - Formulario Recuperar Contraseña */}
							{/* Sección Derecha - Formulario de Registro */}
							<div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
									<h1 className="font-black text-3xl text-center text-transparent bg-clip-text bg-gradient-to-r from-neutral-500 to-neutral-500">
								RECUPERAR CONTRASEÑA
							</h1>
								<form  className="mt-16 space-y-5">
		
									{/* Campo: Correo */}
									<div>
										<label
										htmlFor="email"
										className="text-xs font-bold text-neutral-700 uppercase tracking-widest ml-1"
										>
										CORREO ELECTRONICO
										</label>
										<input
										id="email"
										type="email"
										placeholder="Correo electrónico"
										className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-sky-blue focus:bg-white outline-none transition-all"
										/>
									</div>
		
									{/* Botón de envío */}
									<input
										type="submit"
										className="rounded-md bg-sky-400 p-3 text-white uppercase font-bold hover:bg-cyan-300 transition-colors w-full mt-5"
										value="Enviar"
									/>
		
									{/* Enlace de inicio de sesión */}
								<div className="flex justify-center mt-10 dark:text-gray-600">
										<h2 className="font-medium flex flex-col">
											¿Volver a la página principal?
											<button
												className="font-medium text-blue-600 dark:text-blue-500 hover:underline ml-2 mt-2"
												onClick={() => navigate("/")}
											>
												Volver a Inicio
											</button>
										</h2>
								</div>
								</form>
							</div>
						</div>
					</div>
				</div>
			);
		};
	
export default RContrasena;
