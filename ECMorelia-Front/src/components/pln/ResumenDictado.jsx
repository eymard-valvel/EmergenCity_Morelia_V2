import React from 'react';

const CAMPOS_TEXTO = [
  { ruta: ['seccionE', 'alergias'], etiqueta: 'Alergias' },
  { ruta: ['seccionE', 'medicamentos'], etiqueta: 'Medicamentos habituales' },
  { ruta: ['seccionE', 'enfermedades'], etiqueta: 'Antecedentes / enfermedades' },
  { ruta: ['seccionE', 'ultima_comida'], etiqueta: 'Última comida' }
];

const EXPLORACION = [
  { ruta: ['seccionK', 'cabeza'], etiqueta: 'Cabeza / cuello' },
  { ruta: ['seccionK', 'torax'], etiqueta: 'Tórax' },
  { ruta: ['seccionK', 'abdomen'], etiqueta: 'Abdomen / pelvis' },
  { ruta: ['seccionK', 'extremidades'], etiqueta: 'Extremidades' }
];

const valor = (reporte, ruta) => ruta.reduce((o, k) => (o ? o[k] : undefined), reporte) ?? '';

const ResumenDictado = ({ reporte, onChange, onEliminarIntervencion }) => {
  const intervenciones = reporte.intervenciones || [];

  return (
    <details className="priority-green">
      <summary>Antecedentes, lesiones e intervenciones</summary>
      <div className="section-content">
        <div className="grid-2">
          {CAMPOS_TEXTO.map((c) => (
            <div key={c.ruta.join('.')}>
              <label>{c.etiqueta}</label>
              <input type="text" value={valor(reporte, c.ruta)} onChange={(e) => onChange(c.ruta, e.target.value)} />
            </div>
          ))}
          <div>
            <label>Peso (kg)</label>
            <input type="number" value={valor(reporte, ['seccionD', 'peso'])} onChange={(e) => onChange(['seccionD', 'peso'], e.target.value)} />
          </div>
          <div>
            <label>Embarazo</label>
            <select value={valor(reporte, ['seccionE', 'embarazo'])} onChange={(e) => onChange(['seccionE', 'embarazo'], e.target.value)}>
              <option value="No">No</option>
              <option value="Sí">Sí</option>
            </select>
          </div>
        </div>

        <div>
          <label>Mecanismo de lesión</label>
          <textarea rows="2" value={valor(reporte, ['seccionG', 'mecanismo'])} onChange={(e) => onChange(['seccionG', 'mecanismo'], e.target.value)} />
        </div>

        <div>
          <label>Lesiones encontradas</label>
          <textarea rows="2" value={valor(reporte, ['seccionH', 'lesiones_exposicion'])} onChange={(e) => onChange(['seccionH', 'lesiones_exposicion'], e.target.value)} />
        </div>

        <div className="grid-2">
          {EXPLORACION.map((c) => (
            <div key={c.ruta.join('.')}>
              <label>{c.etiqueta}</label>
              <input type="text" value={valor(reporte, c.ruta)} onChange={(e) => onChange(c.ruta, e.target.value)} />
            </div>
          ))}
        </div>

        <div>
          <label>Intervenciones realizadas</label>
          {intervenciones.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: '6px 0 0' }}>Aún no hay intervenciones registradas.</p>}
          {intervenciones.map((i, idx) => (
            <div
              key={`${i.clave || i.tipo_intervencion}-${idx}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', marginTop: 6, borderRadius: 8, border: '1px solid var(--border-light)' }}
            >
              <span style={{ fontSize: '0.85rem' }}>
                <strong>{i.tipo_intervencion}</strong>
                {i.descripcion ? ` — ${i.descripcion}` : ''}
                {i.hora_intervencion ? ` (${i.hora_intervencion})` : ''}
              </span>
              <button
                type="button"
                onClick={() => onEliminarIntervencion(idx)}
                aria-label="Quitar intervención"
                style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
};

export default ResumenDictado;