import { useNavigate } from "react-router-dom";
import usuario from '../img/imagen_registro.jpg';
import logo from '../img/Logo.png'; // Asegúrate de que el logo esté en la carpeta correcta
import { useFormik } from "formik";
import * as Yup from "yup";
import { useAuth } from "../../auth/useAuth";

const validationSchema = Yup.object().shape({
	nombre: Yup.string()
		.required("El nombre es requerido")
		.min(2, "El nombre debe tener al menos 2 caracteres")
		.max(50, "El nombre no puede exceder los 50 caracteres"),
	licencia_medica: Yup.string()
		.required("La licencia médica es requerida")
		.matches(/^[A-Z0-9]+$/, "La licencia médica solo puede contener letras mayúsculas y números"),
	password: Yup.string()
		.required("La contraseña es requerida")
		.min(6, "La contraseña debe tener al menos 5 caracteres")
		.max(20, "La contraseña no puede exceder los 20 caracteres")
});

const initialValues = {
	nombre: "",
	licencia_medica: "",
	password: ""
};

export const ReceptorFormulario = () => {
	const navigate = useNavigate();

	const formik = useFormik({
		initialValues,
		validationSchema,
		validateOnBlur: false,
		validateOnChange: false,
		onSubmit: async (values) => {
			try {
				await fetch(`${import.meta.env.VITE_API}/auth/signup/receptor`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json"
					},
					body: JSON.stringify(values)
				});
				navigate("/login");
			} catch (error) {
				console.error(error.message);
				console.log(import.meta.env.VITE_API);
			}
		}
	});

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
		<main className="flex-1 flex items-center justify-center p-4 mt-20 md:mt-16">
		<div className="bg-white rounded-3xl shadow-2xl flex flex-col md:flex-row w-full max-w-6xl overflow-hidden min-h-[550px]">

			{/* Sección Izquierda - Imagen o detalles */}
			<div className="hidden md:flex md:w-1/2 bg-slate-100 items-center justify-center relative">
				<div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(#0ea5e9_1px,transparent_1px)] [background-size:20px_20px]"></div>
					<img 
						src={usuario} 
						alt="Auth Illustration" 
						className="h-full l-full object-cover"
					/>
			</div>

			{/* Sección Derecha - Formulario de Registro*/}
			<div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
						<h1 className="font-black text-3xl text-center text-transparent bg-clip-text bg-gradient-to-r from-neutral-500 to-neutral-500">
							REGISTRO DE RECEPTOR
						</h1>

						<form onSubmit={formik.handleSubmit} className="mt-6 space-y-5">					
							{/* Campo: Nombre */}
							<div>
								<label
								htmlFor="nombre"
								className="text-xs font-bold text-neutral-700 uppercase tracking-widest ml-1"
								>
								NOMBRE
								</label>
								<input
								id="nombre"
								type="text"
								name="nombre"
								placeholder="Nombre Completo"
								className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-sky-blue focus:bg-white outline-none transition-all"
								value={formik.values.nombre}
								onChange={formik.handleChange}
								/>
								{formik.errors.nombre && <p className="text-red-500 font-bold">{formik.errors.nombre}</p>}
							</div>

							{/* Campo: Licencia Médica */}
							<div>
								<label
								htmlFor="licencia_medica"
								className="text-xs font-bold text-neutral-700 uppercase tracking-widest ml-1"
								>
								LICENCIA MEDICA
								</label>
								<input
								id="licencia_medica"
								type="text"
								name="licencia_medica"
								placeholder="Licencia Médica"
								className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-sky-blue focus:bg-white outline-none transition-all"
								value={formik.values.licencia_medica}
								onChange={formik.handleChange}
								/>
								{formik.errors.licencia_medica && (
								<p className="text-red-500 font-bold">{formik.errors.licencia_medica}</p>
								)}
							</div>

							{/* Campo: Contraseña */}
							<div>
								<label
								htmlFor="password"
								className="text-xs font-bold text-neutral-700 uppercase tracking-widest ml-1"
								>
								CONTRASEÑA
								</label>
								<input
								id="password"
								type="password"
								name="password"
								placeholder="Contraseña con más de 5 caracteres"
								className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-sky-blue focus:bg-white outline-none transition-all"
								value={formik.values.password}
								onChange={formik.handleChange}
								/>
								{formik.errors.password && <p className="text-red-500 font-bold">{formik.errors.password}</p>}
							</div>

							{/* Botón de envío */}
							<input
								type="submit"
								className="rounded-md bg-sky-400 p-3 text-white uppercase font-bold hover:bg-cyan-300 transition-colors w-full mt-5"
								value="Registrar"
							/>

							{/* Enlace de inicio de sesión */}
							<div className="flex justify-center mt-10 dark:text-gray-600">
							<h2 className="font-medium">
								¿Ya tienes cuenta?
								<button
									className="font-medium text-blue-600 dark:text-blue-500 hover:underline ml-2 mt-2"
									onClick={() => navigate("/login")}
								>
									Iniciar Sesión
								</button>
							</h2>
						</div>
					</form>
				</div>
			</div>
		</main>
	</div>
	
	);
};
