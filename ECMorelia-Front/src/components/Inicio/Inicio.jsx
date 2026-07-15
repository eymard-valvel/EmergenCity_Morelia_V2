// src/components/Inicio/Inicio.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Typed from "typed.js";
import Slider from "react-slick";

// Assets
import logo from "../img/Logo.png";
import carrusel1 from "../img/carrusel1.jpeg";
import carrusel3 from "../img/carrusel3.jpg";
import carrusel4 from "../img/carrusel4.jpg";

// Styles
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const Inicio = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const options = {
            stringsElement: "#cadenas-texto",
            typeSpeed: 75,
            startDelay: 300,
            backSpeed: 75,
            smartBackspace: true,
            shuffle: false,
            backDelay: 1500,
            loop: true,
            showCursor: true,
            cursorChar: "|",
            contentType: "html"
        };

        const typed = new Typed(".typed", options);
        return () => {
            typed.destroy();
        };
    }, []);

    const settings = {
        dots: false, // Desactivado en móvil para no estorbar el UI
        infinite: true,
        speed: 800,
        slidesToShow: 1,
        slidesToScroll: 1,
        autoplay: true,
        autoplaySpeed: 4000,
        fade: true,
        arrows: false // Limpiamos la interfaz de flechas innecesarias
    };

    const handleButtonClick = (role) => {
        localStorage.setItem("selectedRole", role);
        navigate("/login");
    };

    return (
        <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-x-hidden">
            
            {/* --- FONDO: CARRUSEL --- */}
            <div className="fixed inset-0 z-0">
                <Slider {...settings} className="w-full h-full">
                    {[carrusel1, carrusel3, carrusel4].map((img, index) => (
                        <div key={index} className="w-full h-screen">
                            <img
                                src={img}
                                alt={`Slide ${index}`}
                                className="w-full h-full object-cover"
                                style={{ filter: "blur(4px) brightness(0.7)" }} 
                            />
                        </div>
                    ))}
                </Slider>
            </div>

            {/* --- TOP BAR --- */}
            {/* <nav className="fixed top-0 left-0 w-full bg-gradient-to-r from-bluish-gray to-sky-blue p-3 flex items-center shadow-2xl z-50">
                <img src={logo} alt="Emergencity Logo" className="ml-2 w-10 md:w-14" />
                <h1 className="text-sm md:text-xl text-white tracking-widest ml-3">
                    EMERGENCITY
                </h1>
            </nav> */}

            {/* --- CONTENIDO PRINCIPAL --- */}
            <section className="relative z-10 w-full px-4 py-20 flex justify-center items-center">
                <div className="bg-black/35 backdrop-blur-lg p-6 md:p-5 rounded-3xl shadow-2xl flex flex-col items-center w-full max-w-[95%] md:max-w-2xl lg:max-w-3xl transition-all duration-500">
                    
                    {/* Logo y Título */}
                    <img src={logo} alt="Logo" className="mb-4 w-24 md:w-32 lg:w-40 animate-pulse-slow" />
                    
                    <h1 className="text-3xl md:text-5xl lg:text-6xl text-neutral-300 font-bold text-center tracking-tighter">
                        EMERGENCITY
                    </h1>

                    {/* Typed JS Container */}
                    <div className="h-16 flex items-center justify-center">
                        <span className="typed text-lg md:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-neutral-300 to-neutral-300 text-center"></span>
                    </div>

                    {/* Textos ocultos para Typed.js */}
                    <div id="cadenas-texto" className="hidden">
                        <p>Brindando ayuda, salvando vidas</p>
                        <p>Tu compromiso hace la diferencia</p>
                    </div>

                    <hr className="w-full border-neutral-300 my-6" />

                    {/* --- SECCIÓN DE BOTONES --- */}
                    <div className="w-full flex flex-col items-center">
                        <h3 className="text-sm md:text-lg font-bold text-neutral-300 mb-6 uppercase tracking-widest">
                            Selecciona tu rol
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-1 gap-5 w-[60%]">
                            {/* Grupo Rojo: Emergencias */}
                            <button
                                className="group relative overflow-hidden px-6 py-4 rounded-2xl border-2 border-neutral-300 text-red-500 font-bold text-3xl hover:text-neutral-300 transition-all duration-1500 shadow-md hover:shadow-red-500"
                                onClick={() => handleButtonClick("operador")}
                            >
                                <span className="relative z-10">Operador</span>
                                <div className="absolute inset-0 bg-red-500/80 translate-y-[101%] group-hover:translate-y-0 transition-transform duration-300"></div>
                            </button>

                            <button
                                className="group relative overflow-hidden px-6 py-4 rounded-2xl border-2 border-neutral-300 text-red-500 font-bold text-3xl  hover:text-neutral-300 transition-all duration-1500 shadow-md hover:shadow-red-500"
                                onClick={() => handleButtonClick("paramedicos")}
                            >
                                <span className="relative z-10">Paramédico</span>
                                <div className="absolute inset-0 bg-red-500/80 translate-y-[101%] group-hover:translate-y-0 transition-transform duration-300"></div>
                            </button>

                            {/* Grupo Azul: Hospitalario */}
                            <button
                                className="group relative overflow-hidden px-6 py-4 rounded-2xl border-2 border-neutral-300 text-sky-500 font-bold text-3xl g hover:text-neutral-300 transition-all duration-300 shadow-md hover:shadow-sky-400"
                                onClick={() => handleButtonClick("hospitales")}
                            >
                                <span className="relative z-10">Hospital</span>
                                <div className="absolute inset-0 bg-sky-500/80 translate-y-[101%] group-hover:translate-y-0 transition-transform duration-300"></div>
                            </button>

                            <button
                                className="group relative overflow-hidden px-6 py-4 rounded-2xl border-2 border-neutral-300 text-sky-500 font-bold text-3xl  hover:text-neutral-300 transition-all duration-300 shadow-md hover:shadow-sky-400"
                                onClick={() => handleButtonClick("doctor")}
                            >
                                <span className="relative z-10">Doctor</span>
                                <div className="absolute inset-0 bg-sky-500/80 translate-y-[101%] group-hover:translate-y-0 transition-transform duration-300"></div>
                            </button>
                            {<button
                                className="group relative overflow-hidden px-6 py-4 rounded-2xl border-2 border-neutral-300 text-sky-500 font-bold text-3xl hover:text-neutral-300 transition-all duration-300 shadow-md hover:shadow-sky-400"
                                onClick={() => handleButtonClick("receptor")}
                            >
                                <span className="relative z-10">Receptor</span>
                                <div className="absolute inset-0 bg-sky-500/80 translate-y-[101%] group-hover:translate-y-0 transition-transform duration-300"></div>
                            </button>}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Inicio;