// src/components/Ingreso/FormularioIngreso.jsx
import { useNavigate } from "react-router-dom";
import { Dropdown } from "primereact/dropdown";
import { useState, useEffect } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useAuth } from "../../auth/useAuth";
import { newCookie } from "../../helpers/cookies";

// Assets
import logo from '../img/Logo.png';
import usuario from '../img/ingreso_imagen.jpg';

// Esquema de Validación
const validationSchema = Yup.object().shape({
    role: Yup.string().required("El tipo de usuario es requerido"),
    nombre: Yup.string().when("role", {
        is: "hospitales",
        then: (schema) => schema.required("El nombre del hospital es requerido"),
        otherwise: (schema) => schema,
    }),
    licencia_medica: Yup.string().when("role", {
        is: (role) => role !== "hospitales" && role !== "",
        then: (schema) => schema.required("La licencia médica es requerida"),
        otherwise: (schema) => schema,
    }),
    password: Yup.string().required("La contraseña es requerida").min(6, "Mínimo 6 caracteres")
});

const initialValues = {
    role: "",
    nombre: "",
    licencia_medica: "",
    password: ""
};

const roles = [
    { role: "Operador", value: "operador" },
    { role: "Paramedico", value: "paramedicos" },
    { role: "Hospital", value: "hospitales" },
    { role: "Doctor", value: "doctor" },
    { role: "Receptor", value: "receptor" } 
];

const routes = {
    operador: "/navegaciongps",
    paramedicos: "/reportepaciente",
    hospitales: "/navmapa",
    doctor: "/doctor",
    receptor: "/receptor"
};

const Login = () => {
    const { setAuth } = useAuth();
    const [userType, setUserType] = useState("");
    const navigate = useNavigate();
    const [loginError, setLoginError] = useState("");

    const formik = useFormik({
        initialValues,
        validationSchema,
        onSubmit: async (values) => {
            setLoginError("");
            try {
                const newValues = {
                    role: values.role,
                    password: values.password,
                    ...(values.role === "hospitales" ? { nombre: values.nombre } : { licencia_medica: values.licencia_medica })
                };

                const request = await fetch(`${import.meta.env.VITE_API}/auth/login/${newValues.role}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(newValues)
                });

                if (!request.ok) {
                    const errorData = await request.json().catch(() => ({ message: "Credenciales inválidas." }));
                    throw new Error(errorData.message || "Error al iniciar sesión.");
                }

                const response = await request.json();

                // Dentro de onSubmit, después de const response = await request.json();
localStorage.setItem("role", response.role);
localStorage.setItem("user", JSON.stringify({ 
    nombre: values.nombre || values.licencia_medica 
}));

                if (values.role === "hospitales") {
                    localStorage.setItem("hospitalInfo", JSON.stringify({
                        id: response.id_hospitales,
                        nombre: response.nombre,
                        direccion: response.direccion,
                        ubicacion: { lat: response.latitud || 19.702428, lng: response.longitud || -101.1969319 }
                    }));
                }
                
                newCookie({ name: "role", value: response.role });
                setAuth(response.role);
                console.log("Rol recibido del backend:", response.role);
console.log("Ruta a navegar:", routes[values.role]);
                navigate(routes[values.role]);

            } catch (error) {
                setLoginError(error.message);
            }
        }
    });

    useEffect(() => {
        const savedRole = localStorage.getItem("selectedRole");
        if (savedRole && roles.some(r => r.value === savedRole)) {
            setUserType(savedRole);
            formik.setFieldValue("role", savedRole);
        }
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-300 via-gray-400 to-gray-500 flex flex-col font-sans">
            {/* --- NAVIGATION BAR --- */}
            <nav className="fixed top-0 w-full bg-gradient-to-r from-bluish-gray to-sky-400 p-3 flex items-center justify-center shadow-md z-50 px-6">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
                    <img src={logo} alt="Logo" className="w-10 md:w-12" />
                    <h1 className="text-neutral-300 font-black tracking-tighter text-4xl">EMERGENCITY</h1>
                </div>
            </nav>

            {/* --- MAIN CONTAINER --- */}
            <main className="flex-1 flex items-center justify-center p-4 mt-20 md:mt-16">
                <div className="bg-white rounded-3xl shadow-2xl flex flex-col md:flex-row w-full max-w-6xl overflow-hidden min-h-[550px]">
                    
                    {/* --- LEFT SECTION: ART/ICON --- */}
                    <div className="hidden md:flex md:w-1/2 bg-slate-100 items-center justify-center relative">
                        <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(#0ea5e9_1px,transparent_1px)] [background-size:20px_20px]"></div>
                        <img 
                            src={usuario} 
                            alt="Auth Illustration" 
                            className="h-full l-full object-cover"
                        />
                    </div>

                    {/* --- RIGHT SECTION: FORM --- */}
                    <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
                        <header className="text-center mb-8 flex-col h-[14%]">
                            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-neutral-500 to-neutral-500 inline-block">
                                BIENVENIDO
                            </h2>
                            <p className="text-slate-500 font-medium mt-2 text-neutral-500">Introduce tus credenciales de acceso</p>
                        </header>

                        {loginError && (
                            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-center gap-3 animate-shake">
                                <span className="text-red-700 text-sm font-bold">{loginError}</span>
                            </div>
                        )}

                        <form onSubmit={formik.handleSubmit} className="space-y-5">
                            {/* Role Dropdown */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-neutral-700 uppercase tracking-widest ml-1">Tipo de Usuario</label>
                                <Dropdown
                                    id="role"
                                    value={formik.values.role}
                                    options={roles}
                                    optionLabel="role"
                                    optionValue="value"
                                    onChange={(e) => {
                                        formik.setFieldValue("role", e.value);
                                        setUserType(e.value);
                                    }}
                                    placeholder="Selecciona tu rol"
                                    className={` w-full py-1.5 rounded-xl border-2 transition-all ${formik.touched.role && formik.errors.role ? 'border-red-300' : 'border-slate-100 hover:border-sky-blue/30'}`}
                                />
                                {formik.touched.role && formik.errors.role && <small className="text-red-500 font-semibold ml-1">{formik.errors.role}</small>}
                            </div>

                            {/* Dynamic Field: Hospital Name */}
                            {userType === "hospitales" && (
                                <div className="flex flex-col gap-1.5 animate-fade-down">
                                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-widest ml-1">Nombre Hospital</label>
                                    <input
                                        name="nombre"
                                        type="text"
                                        placeholder="Ej. Hospital General"
                                        className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-sky-blue focus:bg-white outline-none transition-all"
                                        {...formik.getFieldProps('nombre')}
                                    />
                                    {formik.touched.nombre && formik.errors.nombre && <small className="text-red-500 font-semibold ml-1">{formik.errors.nombre}</small>}
                                </div>
                            )}

                            {/* Dynamic Field: Medical License */}
                            {userType && userType !== "hospitales" && (
                                <div className="flex flex-col gap-1.5 animate-fade-down">
                                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-widest ml-1">Licencia Médica</label>
                                    <input
                                        name="licencia_medica"
                                        type="text"
                                        placeholder="Ingresa tu cédula/licencia"
                                        className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-sky-blue focus:bg-white outline-none transition-all"
                                        {...formik.getFieldProps('licencia_medica')}
                                    />
                                    {formik.touched.licencia_medica && formik.errors.licencia_medica && <small className="text-red-500 font-semibold ml-1">{formik.errors.licencia_medica}</small>}
                                </div>
                            )}

                            {/* Password */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-neutral-700 uppercase tracking-widest ml-1">Contraseña</label>
                                <input
                                    name="password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-sky-blue focus:bg-white outline-none transition-all"
                                    {...formik.getFieldProps('password')}
                                />
                                {formik.touched.password && formik.errors.password && <small className="text-red-500 font-semibold ml-1">{formik.errors.password}</small>}
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={formik.isSubmitting}
                                className="w-full bg-gradient-to-r from-coral-red to-red-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-red-200 hover:shadow-red-300 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                            >
                                {formik.isSubmitting ? 'VERIFICANDO...' : 'INGRESAR'}
                            </button>

                            {/* Footer Links */}
                            <footer className="flex flex-col gap-3 pt-8 border-t border-neutral-200 mt-4">
                                <button 
                                    type="button" 
                                    className="font-medium text-blue-600 dark:text-blue-500 hover:underline ml-2 mt-2"
                                    onClick={() => navigate(`/signup/${formik.values.role || 'operador'}`)}
                                >
                                    <span className="underline">Crear cuenta de acceso</span>
                                </button>
                                <button 
                                    type="button" 
                                    className="font-medium text-blue-600 dark:text-blue-500 hover:underline ml-2 mt-2"
                                    onClick={() => navigate("/recover-password")}
                                >
                                    <span className="underline">Recuperar acceso</span>
                                </button>
                            </footer>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Login;