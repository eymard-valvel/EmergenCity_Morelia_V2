import { useNavigate } from "react-router-dom";
import usuario from '../img/formularioRegistroIcono.jpg';
import logo from '../img/Logo.png';
import { useFormik } from "formik";
import * as Yup from "yup";

const validationSchema = Yup.object().shape({
    nombre: Yup.string()
        .required("El nombre es requerido")
        .min(2, "Mínimo 2 caracteres")
        .max(50, "Máximo 50 caracteres"),
    licencia_medica: Yup.string()
        .required("La licencia médica es requerida")
        .matches(/^[A-Z0-9]+$/, "Solo mayúsculas y números"),
    /*turno: Yup.string()
        .required("El turno es requerido")
        .oneOf(["diurno", "nocturno"], "Turno inválido"),*/
    password: Yup.string()
        .required("Contraseña requerida")
        .min(6, "Mínimo 6 caracteres")
        .max(20, "Máximo 20 caracteres")
});

const initialValues = {
    nombre: "",
    licencia_medica: "",
    turno: "diurno",
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
                const response = await fetch(`${import.meta.env.VITE_API}/auth/signup/receptor`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(values)
                });
                if (response.ok) {
                    navigate("/login");
                } else {
                    const error = await response.json();
                    console.error(error.message);
                    alert(error.message || "Error al registrar receptor");
                }
            } catch (error) {
                console.error(error.message);
                alert("Error de conexión");
            }
        }
    });

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-300 via-gray-400 to-gray-500 flex flex-col">
            {/* Topbar */}
            <nav className="fixed top-0 left-0 w-full bg-gradient-to-r from-[#002D62] to-[#74C2E1] p-2 flex items-center shadow-lg z-50">
                <img src={logo} alt="Emergencity Logo" className="ml-3 cursor-pointer" width="70" onClick={() => navigate("/")} />
                <h1 className="text-lg font-bold text-white tracking-wide mx-2 cursor-pointer" onClick={() => navigate("/")}>EMERGENCITY</h1>
            </nav>

            {/* Contenedor del Formulario */}
            <div className="flex items-center justify-center flex-1 p-8 mt-[4.5rem]">
                <div className="flex bg-white rounded-lg shadow-lg overflow-hidden w-full max-w-4xl">
                    {/* Sección Izquierda - Imagen */}
                    <div className="w-[30rem] bg-gray-100 p-8 flex flex-col items-center">
                        <img src={usuario} alt="Icono Usuario" className="mt-20 mb-4" style={{ maxWidth: "330px", maxHeight: "300px" }} />
                    </div>

                    {/* Sección Derecha - Formulario */}
                    <div className="w-2/3 p-8">
                        <h1 className="font-black text-3xl text-center text-transparent bg-clip-text bg-gradient-to-r from-[#002D62] to-[#74C2E1]">
                            REGISTRO DE RECEPTOR
                        </h1>
                        <form onSubmit={formik.handleSubmit} className="mt-6 space-y-5">
                            <div>
                                <label className="block text-blue-950 uppercase font-bold text-2xl text-left">NOMBRE</label>
                                <input type="text" name="nombre" placeholder="Nombre Completo"
                                    className="mt-2 border-2 w-full p-2 placeholder-stone-400 rounded-md"
                                    value={formik.values.nombre} onChange={formik.handleChange} />
                                {formik.errors.nombre && <p className="text-red-500 font-bold">{formik.errors.nombre}</p>}
                            </div>
                            <div>
                                <label className="block text-blue-950 uppercase font-bold text-2xl text-left">LICENCIA MÉDICA</label>
                                <input type="text" name="licencia_medica" placeholder="Licencia Médica"
                                    className="mt-2 border-2 w-full p-2 placeholder-stone-400 rounded-md"
                                    value={formik.values.licencia_medica} onChange={formik.handleChange} />
                                {formik.errors.licencia_medica && <p className="text-red-500 font-bold">{formik.errors.licencia_medica}</p>}
                            </div>
                            {/*<div>
                                <label className="block text-blue-950 uppercase font-bold text-2xl text-left">TURNO</label>
                                <select name="turno"
                                    className="mt-2 border-2 w-full p-2 rounded-md"
                                    value={formik.values.turno} onChange={formik.handleChange}>
                                    <option value="diurno">Diurno</option>
                                    <option value="nocturno">Nocturno</option>
                                </select>
                                {formik.errors.turno && <p className="text-red-500 font-bold">{formik.errors.turno}</p>}
                            </div>*/}
                            <div>
                                <label className="block text-blue-950 uppercase font-bold text-2xl text-left">CONTRASEÑA</label>
                                <input type="password" name="password" placeholder="Contraseña (mínimo 6 caracteres)"
                                    className="mt-2 border-2 w-full p-2 placeholder-stone-400 rounded-md"
                                    value={formik.values.password} onChange={formik.handleChange} />
                                {formik.errors.password && <p className="text-red-500 font-bold">{formik.errors.password}</p>}
                            </div>
                            <input type="submit" className="rounded-md bg-cyan-500 p-3 text-white uppercase font-bold hover:bg-cyan-300 transition-colors w-full mt-5" value="Registrar" />
                            <div className="flex justify-center mt-10">
                                <h2 className="font-medium">
                                    ¿Ya tienes cuenta?
                                    <button type="button" className="font-medium text-blue-600 hover:underline ml-2"
                                        onClick={() => navigate("/login")}>Iniciar Sesión</button>
                                </h2>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};