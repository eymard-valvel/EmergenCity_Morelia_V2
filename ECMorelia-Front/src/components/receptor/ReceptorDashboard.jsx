import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../img/Logo.png";

const ReceptorDashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    // Verificar que realmente sea receptor (opcional)
    const role = localStorage.getItem("role");
    if (role !== "receptor") {
      navigate("/login");
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 w-full bg-gradient-to-r from-[#002D62] to-[#74C2E1] p-3 flex items-center shadow-lg z-50">
        <img
          src={logo}
          alt="Emergencity Logo"
          className="ml-3 cursor-pointer w-12"
          onClick={() => navigate("/")}
        />
        <h1
          className="text-xl font-bold text-white tracking-wide mx-2 cursor-pointer"
          onClick={() => navigate("/")}
        >
          EMERGENCITY
        </h1>
        <div className="ml-auto mr-4 text-white font-semibold">
          Receptor: {user.nombre || "Sin nombre"}
        </div>
      </nav>

      {/* Contenido principal */}
      <div className="pt-24 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full text-center">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#002D62] to-[#74C2E1] mb-4">
            ¡Bienvenido, Receptor!
          </h2>
          <p className="text-gray-600 text-lg mb-6">
            Has iniciado sesión correctamente como <span className="font-bold text-blue-600">Receptor</span>.
          </p>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg text-left">
            <p className="text-blue-800">
              📡 Este es el panel principal del perfil Receptor. Aquí podrás gestionar comunicaciones, ver emergencias asignadas y coordinar recursos.
            </p>
          </div>
          <button
            onClick={() => navigate("/")}
            className="mt-8 bg-gradient-to-r from-coral-red to-red-500 text-white font-bold py-2 px-6 rounded-xl shadow-lg hover:shadow-red-200 transition-all"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceptorDashboard;