const API_URL = import.meta.env.VITE_API || 'http://localhost:3000/api';

export const parseText = async (text) => {
  const response = await fetch(`${API_URL}/nlp/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en el servidor: ${response.status} - ${errorText}`);
  }
  const data = await response.json();
  return data;
};